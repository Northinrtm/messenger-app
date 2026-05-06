package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class VaultTransitClient {

    private final ObjectMapper objectMapper;
    private final E2eeEscrowProperties escrowProperties;
    private final HttpClient httpClient;

    public VaultTransitClient(ObjectMapper objectMapper, E2eeEscrowProperties escrowProperties) {
        this.objectMapper = objectMapper;
        this.escrowProperties = escrowProperties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(escrowProperties.effectiveVaultConnectTimeout())
                .build();
    }

    public String encrypt(String mountPath, String keyName, byte[] additionalData, String plaintext) {
        try {
            JsonNode requestBody = objectMapper.createObjectNode()
                    .put("plaintext", Base64.getEncoder().encodeToString(plaintext.getBytes(StandardCharsets.UTF_8)))
                    .put("associated_data", Base64.getEncoder().encodeToString(additionalData));
            HttpRequest request = baseRequest(mountPath, "encrypt", keyName)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();
            JsonNode response = send(request);
            String ciphertext = response.path("data").path("ciphertext").asText();
            if (ciphertext == null || ciphertext.isBlank()) {
                throw new IllegalStateException("Vault transit encrypt response does not contain ciphertext");
            }
            return ciphertext;
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to serialize Vault transit encrypt request", exception);
        }
    }

    public String decrypt(String mountPath, String keyName, byte[] additionalData, String ciphertext) {
        try {
            JsonNode requestBody = objectMapper.createObjectNode()
                    .put("ciphertext", ciphertext)
                    .put("associated_data", Base64.getEncoder().encodeToString(additionalData));
            HttpRequest request = baseRequest(mountPath, "decrypt", keyName)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();
            JsonNode response = send(request);
            String plaintext = response.path("data").path("plaintext").asText();
            if (plaintext == null || plaintext.isBlank()) {
                throw new IllegalStateException("Vault transit decrypt response does not contain plaintext");
            }
            return new String(Base64.getDecoder().decode(plaintext), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to serialize Vault transit decrypt request", exception);
        }
    }

    private HttpRequest.Builder baseRequest(String mountPath, String operation, String keyName) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(resolveUri(mountPath, operation, keyName))
                .timeout(escrowProperties.effectiveVaultRequestTimeout())
                .header("Content-Type", "application/json")
                .header("X-Vault-Token", escrowProperties.vaultToken());
        String namespace = escrowProperties.normalizedVaultNamespace();
        if (!namespace.isBlank()) {
            builder.header("X-Vault-Namespace", namespace);
        }
        return builder;
    }

    private URI resolveUri(String mountPath, String operation, String keyName) {
        String normalizedMountPath = normalizePathSegment(mountPath);
        String normalizedKeyName = normalizePathSegment(keyName);
        return URI.create(
                escrowProperties.normalizedVaultAddress()
                        + "/v1/"
                        + normalizedMountPath
                        + "/"
                        + operation
                        + "/"
                        + normalizedKeyName
        );
    }

    private JsonNode send(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(
                        "Vault transit request failed with status " + response.statusCode() + ": " + response.body()
                );
            }
            return objectMapper.readTree(response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("Vault transit request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Vault transit request interrupted", exception);
        }
    }

    private String normalizePathSegment(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Vault transit path segment must not be blank");
        }
        String normalized = value.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
