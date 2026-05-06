package com.north.messenger.application.e2ee;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.jsonwebtoken.io.Encoders;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class ChatHistoryKeyEscrowCryptoServiceTest {

    private static final String ESCROW_CONTEXT = "north.chat-history-escrow.v2";
    private static final String TRANSIT_MOUNT_PATH = "transit";
    private static final String TRANSIT_KEY_NAME = "messenger-history-escrow";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final byte[] escrowKeyBytes = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);

    @Test
    void encryptGrantPayloadShouldUseVersionedEscrowAdditionalData() throws Exception {
        ChatHistoryKeyEscrowCryptoService service = new ChatHistoryKeyEscrowCryptoService(
                objectMapper,
                localEscrowProperties(),
                new VaultTransitClient(objectMapper, localEscrowProperties())
        );
        String grantPayload = validGrantPayload();

        String encryptedGrantPayload = service.encryptGrantPayload(grantPayload);

        JsonNode envelope = objectMapper.readTree(encryptedGrantPayload);
        assertThat(envelope.path("aadVersion").asInt()).isEqualTo(2);
        assertThat(envelope.path("context").asText()).isEqualTo(ESCROW_CONTEXT);
        assertThat(envelope.path("chatId").asText()).isEqualTo("81b795ab-3b04-49fa-9e84-b2941d0c16af");
        assertThat(envelope.path("historyKeyId").asText()).isEqualTo("f9ee3a01-67cb-4141-8df4-f5f79a0b78a8");
        assertThat(envelope.path("membershipVersion").asLong()).isEqualTo(5L);
        assertThat(envelope.path("historyPolicy").asText()).isEqualTo("JOIN_ONLY");
        assertThat(envelope.path("createdAt").asText()).isEqualTo("2026-05-02T11:12:09.000Z");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(escrowKeyBytes, "AES"),
                new GCMParameterSpec(128, Base64.getDecoder().decode(envelope.path("iv").asText()))
        );
        cipher.updateAAD(String.join(
                "\n",
                ESCROW_CONTEXT,
                "2",
                envelope.path("chatId").asText(),
                envelope.path("historyKeyId").asText(),
                Long.toString(envelope.path("membershipVersion").asLong()),
                envelope.path("historyPolicy").asText(),
                envelope.path("createdAt").asText()
        ).getBytes(StandardCharsets.UTF_8));

        String decryptedGrantPayload = new String(
                cipher.doFinal(Base64.getDecoder().decode(envelope.path("ciphertext").asText())),
                StandardCharsets.UTF_8
        );
        assertThat(decryptedGrantPayload).isEqualTo(grantPayload);
        assertThat(service.decryptGrantPayload(encryptedGrantPayload)).isEqualTo(grantPayload);
    }

    @Test
    void encryptAndDecryptGrantPayloadShouldUseVaultTransitWhenConfigured() throws Exception {
        AtomicReference<String> encryptBody = new AtomicReference<>();
        AtomicReference<String> decryptBody = new AtomicReference<>();
        String grantPayload = validGrantPayload();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/transit/encrypt/" + TRANSIT_KEY_NAME, exchange -> {
            encryptBody.set(readBody(exchange));
            assertThat(exchange.getRequestHeaders().getFirst("X-Vault-Token")).isEqualTo("vault-token");
            writeJson(exchange, 200, """
                    {"data":{"ciphertext":"vault:v1:test-ciphertext"}}
                    """);
        });
        server.createContext("/v1/transit/decrypt/" + TRANSIT_KEY_NAME, exchange -> {
            decryptBody.set(readBody(exchange));
            writeJson(exchange, 200, """
                    {"data":{"plaintext":"%s"}}
                    """.formatted(Base64.getEncoder().encodeToString(grantPayload.getBytes(StandardCharsets.UTF_8))));
        });
        server.start();

        try {
            E2eeEscrowProperties properties = vaultTransitProperties("http://127.0.0.1:" + server.getAddress().getPort());
            ChatHistoryKeyEscrowCryptoService service = new ChatHistoryKeyEscrowCryptoService(
                    objectMapper,
                    properties,
                    new VaultTransitClient(objectMapper, properties)
            );

            String encryptedGrantPayload = service.encryptGrantPayload(grantPayload);
            JsonNode envelope = objectMapper.readTree(encryptedGrantPayload);
            assertThat(envelope.path("provider").asText()).isEqualTo("vault-transit");
            assertThat(envelope.path("mountPath").asText()).isEqualTo(TRANSIT_MOUNT_PATH);
            assertThat(envelope.path("keyName").asText()).isEqualTo(TRANSIT_KEY_NAME);
            assertThat(envelope.path("ciphertext").asText()).isEqualTo("vault:v1:test-ciphertext");

            String decryptedGrantPayload = service.decryptGrantPayload(encryptedGrantPayload);
            assertThat(decryptedGrantPayload).isEqualTo(grantPayload);

            JsonNode encryptRequest = objectMapper.readTree(encryptBody.get());
            JsonNode decryptRequest = objectMapper.readTree(decryptBody.get());
            String expectedAdditionalData = Base64.getEncoder().encodeToString(String.join(
                    "\n",
                    ESCROW_CONTEXT,
                    "2",
                    "81b795ab-3b04-49fa-9e84-b2941d0c16af",
                    "f9ee3a01-67cb-4141-8df4-f5f79a0b78a8",
                    "5",
                    "JOIN_ONLY",
                    "2026-05-02T11:12:09.000Z"
            ).getBytes(StandardCharsets.UTF_8));
            assertThat(encryptRequest.path("plaintext").asText())
                    .isEqualTo(Base64.getEncoder().encodeToString(grantPayload.getBytes(StandardCharsets.UTF_8)));
            assertThat(encryptRequest.path("associated_data").asText()).isEqualTo(expectedAdditionalData);
            assertThat(decryptRequest.path("ciphertext").asText()).isEqualTo("vault:v1:test-ciphertext");
            assertThat(decryptRequest.path("associated_data").asText()).isEqualTo(expectedAdditionalData);
        } finally {
            server.stop(0);
        }
    }

    private E2eeEscrowProperties localEscrowProperties() {
        return new E2eeEscrowProperties(
                E2eeEscrowProperties.PROVIDER_LOCAL,
                Encoders.BASE64.encode(escrowKeyBytes),
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    private E2eeEscrowProperties vaultTransitProperties(String address) {
        return new E2eeEscrowProperties(
                E2eeEscrowProperties.PROVIDER_VAULT_TRANSIT,
                null,
                address,
                "vault-token",
                "",
                TRANSIT_MOUNT_PATH,
                TRANSIT_KEY_NAME,
                Duration.ofSeconds(2),
                Duration.ofSeconds(5)
        );
    }

    private String validGrantPayload() {
        return """
                {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"81b795ab-3b04-49fa-9e84-b2941d0c16af","historyKeyId":"f9ee3a01-67cb-4141-8df4-f5f79a0b78a8","historyKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","membershipVersion":5,"historyPolicy":"JOIN_ONLY","createdAt":"2026-05-02T11:12:09.000Z"}
                """;
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void writeJson(HttpExchange exchange, int statusCode, String body) throws IOException {
        byte[] responseBytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, responseBytes.length);
        exchange.getResponseBody().write(responseBytes);
        exchange.close();
    }
}
