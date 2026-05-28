package com.north.messenger.application.mail;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "true", matchIfMissing = false)
public class StalwartAdminClient {

    private static final Logger log = LoggerFactory.getLogger(StalwartAdminClient.class);

    private final String baseUrl;
    private final String authHeader;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public StalwartAdminClient(MailProperties properties, ObjectMapper objectMapper) {
        this.baseUrl = properties.stalwartUrl();
        String credentials = "admin:" + properties.stalwartAdminSecret();
        this.authHeader = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean createAccount(String username, String password, String domain) {
        try {
            Map<String, Object> body = Map.of(
                    "type", "individual",
                    "name", username,
                    "secret", password,
                    "emails", List.of(username + "@" + domain),
                    "quota", 0
            );
            String json = objectMapper.writeValueAsString(body);
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/principal"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", authHeader)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 201) {
                return true;
            }
            log.warn("Stalwart createAccount failed for {} status={} body={}", username, response.statusCode(), response.body());
            return false;
        } catch (Exception exception) {
            log.warn("Stalwart createAccount error for {}: {}", username, exception.getMessage());
            return false;
        }
    }

    public boolean deleteAccount(String username) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/principal/" + username))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", authHeader)
                    .DELETE()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() == 200 || response.statusCode() == 204 || response.statusCode() == 404) {
                return true;
            }
            log.warn("Stalwart deleteAccount failed for {} status={}", username, response.statusCode());
            return false;
        } catch (Exception exception) {
            log.warn("Stalwart deleteAccount error for {}: {}", username, exception.getMessage());
            return false;
        }
    }

    public boolean renameAccount(String oldUsername, String newUsername, String domain) {
        try {
            Map<String, Object> body = Map.of(
                    "name", newUsername,
                    "emails", List.of(newUsername + "@" + domain)
            );
            String json = objectMapper.writeValueAsString(body);
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/principal/" + oldUsername))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", authHeader)
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 204) {
                return true;
            }
            log.warn("Stalwart renameAccount failed {} -> {} status={}", oldUsername, newUsername, response.statusCode());
            return false;
        } catch (Exception exception) {
            log.warn("Stalwart renameAccount error {} -> {}: {}", oldUsername, newUsername, exception.getMessage());
            return false;
        }
    }
}
