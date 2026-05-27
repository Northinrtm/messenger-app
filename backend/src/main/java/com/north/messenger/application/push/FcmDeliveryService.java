package com.north.messenger.application.push;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.jsonwebtoken.Jwts;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * Delivers push notifications to Android devices via FCM HTTP v1 API.
 * Uses a Google service account JWT to obtain OAuth2 access tokens —
 * no Firebase Admin SDK dependency required.
 */
@Service
@ConditionalOnProperty(name = "app.push.fcm.enabled", havingValue = "true")
public class FcmDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(FcmDeliveryService.class);

    private static final String GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
    private static final String GRANT_TYPE = "urn:ietf:params:oauth2:grant-type:jwt-bearer";
    private static final Duration ACCESS_TOKEN_TTL = Duration.ofHours(1);
    private static final Duration ACCESS_TOKEN_REFRESH_BUFFER = Duration.ofMinutes(5);

    private final String clientEmail;
    private final String projectId;
    private final PrivateKey privateKey;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private volatile String cachedAccessToken;
    private volatile Instant cachedAccessTokenExpiresAt = Instant.EPOCH;
    private final Object tokenLock = new Object();

    public FcmDeliveryService(FcmProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        try {
            JsonNode sa = objectMapper.readTree(properties.serviceAccountJson());
            this.clientEmail = sa.get("client_email").asText();
            this.projectId = sa.get("project_id").asText();
            this.privateKey = parsePrivateKey(sa.get("private_key").asText());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize FCM service from service account JSON", e);
        }
    }

    /**
     * Sends a generic new-message push notification to a single FCM token.
     *
     * @param unreadCount total unread messages for this recipient, used to set the launcher badge
     * @return true if delivered, false if the token is permanently invalid and should be removed
     */
    public boolean sendNewMessageNotification(String fcmToken, String chatId, int unreadCount) {
        try {
            String accessToken = getAccessToken();
            ObjectNode message = buildMessage(fcmToken, chatId, unreadCount);
            ObjectNode payload = objectMapper.createObjectNode().set("message", message);

            HttpRequest request = HttpRequest.newBuilder(
                            URI.create("https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + accessToken)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return true;
            }

            if (response.statusCode() == 401) {
                // Access token expired — invalidate cache and retry once
                invalidateAccessTokenCache();
                String freshToken = getAccessToken();
                HttpRequest retryRequest = HttpRequest.newBuilder(
                                URI.create("https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send"))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer " + freshToken)
                        .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                        .timeout(Duration.ofSeconds(10))
                        .build();
                HttpResponse<String> retryResponse = httpClient.send(retryRequest, HttpResponse.BodyHandlers.ofString());
                if (retryResponse.statusCode() == 200) {
                    return true;
                }
                log.warn("FCM send failed after token refresh status={} chatId={}", retryResponse.statusCode(), chatId);
                return true; // don't delete the device token on auth issues
            }

            // 404/410 = token is invalid or unregistered
            if (response.statusCode() == 404 || response.statusCode() == 410) {
                return false;
            }

            log.warn("FCM send failed status={} chatId={}", response.statusCode(), chatId);
            return true;

        } catch (Exception e) {
            log.warn("FCM send exception chatId={}: {}", chatId, e.getMessage());
            return true; // don't delete device token on transient errors
        }
    }

    private ObjectNode buildMessage(String fcmToken, String chatId, int unreadCount) {
        ObjectNode message = objectMapper.createObjectNode();
        message.put("token", fcmToken);

        ObjectNode notification = objectMapper.createObjectNode();
        notification.put("title", "Новое сообщение");
        notification.put("body", "У вас новое сообщение");
        message.set("notification", notification);

        ObjectNode androidNotification = objectMapper.createObjectNode();
        androidNotification.put("channel_id", "north_messages");
        androidNotification.put("sound", "default");
        androidNotification.put("priority", "HIGH");
        if (unreadCount > 0) {
            androidNotification.put("notification_count", unreadCount);
        }

        ObjectNode android = objectMapper.createObjectNode();
        android.put("priority", "high");
        android.set("notification", androidNotification);
        message.set("android", android);

        ObjectNode data = objectMapper.createObjectNode();
        data.put("chatId", chatId);
        message.set("data", data);

        return message;
    }

    private String getAccessToken() throws Exception {
        Instant now = Instant.now();
        if (cachedAccessToken != null
                && now.isBefore(cachedAccessTokenExpiresAt.minus(ACCESS_TOKEN_REFRESH_BUFFER))) {
            return cachedAccessToken;
        }
        synchronized (tokenLock) {
            now = Instant.now();
            if (cachedAccessToken != null
                    && now.isBefore(cachedAccessTokenExpiresAt.minus(ACCESS_TOKEN_REFRESH_BUFFER))) {
                return cachedAccessToken;
            }
            String newToken = fetchAccessToken(now);
            cachedAccessToken = newToken;
            cachedAccessTokenExpiresAt = now.plus(ACCESS_TOKEN_TTL);
            return newToken;
        }
    }

    private void invalidateAccessTokenCache() {
        synchronized (tokenLock) {
            cachedAccessToken = null;
            cachedAccessTokenExpiresAt = Instant.EPOCH;
        }
    }

    private String fetchAccessToken(Instant now) throws Exception {
        String serviceJwt = Jwts.builder()
                .id(UUID.randomUUID().toString())
                .issuer(clientEmail)
                .subject(clientEmail)
                .audience().add("https://oauth2.googleapis.com/token").and()
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ACCESS_TOKEN_TTL)))
                .claim("scope", FCM_SCOPE)
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();

        String formBody = "grant_type=" + URLEncoder.encode(GRANT_TYPE, StandardCharsets.UTF_8)
                + "&assertion=" + URLEncoder.encode(serviceJwt, StandardCharsets.UTF_8);

        HttpRequest tokenRequest = HttpRequest.newBuilder(URI.create(GOOGLE_TOKEN_URL))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(formBody))
                .timeout(Duration.ofSeconds(10))
                .build();

        HttpResponse<String> response = httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException(
                    "Failed to obtain FCM access token from Google OAuth2, status=" + response.statusCode());
        }

        JsonNode body = objectMapper.readTree(response.body());
        return body.get("access_token").asText();
    }

    private static PrivateKey parsePrivateKey(String pem) throws Exception {
        String normalized = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s+", "");
        byte[] keyBytes = Base64.getDecoder().decode(normalized);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
    }
}
