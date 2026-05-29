package com.north.messenger.application.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class JitsiJwtService {

    private static final String HEADER = base64url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");

    private final JitsiJwtProperties properties;
    private final ObjectMapper objectMapper;

    public JitsiJwtService(JitsiJwtProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean isEnabled() {
        return properties.enabled();
    }

    public String generateToken(UUID userId, String displayName, String email, String roomName, boolean moderator) {
        if (!properties.enabled()) {
            throw new IllegalStateException("Jitsi JWT is not enabled");
        }

        long now = Instant.now().getEpochSecond();
        long exp = now + (long) properties.tokenTtl().toSeconds();

        Map<String, Object> userContext = new LinkedHashMap<>();
        userContext.put("id", userId.toString());
        userContext.put("name", displayName);
        userContext.put("email", email);
        userContext.put("moderator", moderator);

        Map<String, Object> featuresContext = new LinkedHashMap<>();
        featuresContext.put("recording", false);
        featuresContext.put("livestreaming", false);
        featuresContext.put("transcription", false);
        featuresContext.put("outbound-call", false);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("user", userContext);
        context.put("features", featuresContext);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("iss", properties.appId());
        payload.put("sub", properties.domain());
        payload.put("aud", properties.appId());
        payload.put("room", roomName != null ? roomName : "*");
        payload.put("iat", now);
        payload.put("nbf", now);
        payload.put("exp", exp);
        payload.put("context", context);

        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            String signingInput = HEADER + "." + base64url(payloadJson);
            String signature = hmacSha256(properties.appSecret(), signingInput);
            return signingInput + "." + signature;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to generate Jitsi JWT", e);
        }
    }

    private static String hmacSha256(String secret, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] sig = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
    }

    private static String base64url(String input) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(input.getBytes(StandardCharsets.UTF_8));
    }
}
