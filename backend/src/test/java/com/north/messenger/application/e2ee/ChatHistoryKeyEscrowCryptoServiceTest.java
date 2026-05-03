package com.north.messenger.application.e2ee;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.io.Encoders;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class ChatHistoryKeyEscrowCryptoServiceTest {

    private static final String ESCROW_CONTEXT = "north.chat-history-escrow.v2";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final byte[] escrowKeyBytes = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);
    private final ChatHistoryKeyEscrowCryptoService service = new ChatHistoryKeyEscrowCryptoService(
            objectMapper,
            new E2eeEscrowProperties(Encoders.BASE64.encode(escrowKeyBytes), false)
    );

    @Test
    void encryptGrantPayloadShouldUseVersionedEscrowAdditionalData() throws Exception {
        String grantPayload = """
                {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"81b795ab-3b04-49fa-9e84-b2941d0c16af","historyKeyId":"f9ee3a01-67cb-4141-8df4-f5f79a0b78a8","historyKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","membershipVersion":5,"historyPolicy":"JOIN_ONLY","createdAt":"2026-05-02T11:12:09.000Z"}
                """;

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
    void decryptGrantPayloadShouldRemainCompatibleWithLegacyEscrowEnvelope() throws Exception {
        String grantPayload = """
                {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"81b795ab-3b04-49fa-9e84-b2941d0c16af","historyKeyId":"f9ee3a01-67cb-4141-8df4-f5f79a0b78a8","historyKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","membershipVersion":5,"historyPolicy":"JOIN_ONLY","createdAt":"2026-05-02T11:12:09.000Z"}
                """;
        byte[] iv = "legacy-iv-01".getBytes(StandardCharsets.UTF_8);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(escrowKeyBytes, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD("1".getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(grantPayload.getBytes(StandardCharsets.UTF_8));

        String legacyEnvelope = objectMapper.writeValueAsString(objectMapper.createObjectNode()
                .put("aadVersion", 1)
                .put("iv", Base64.getEncoder().encodeToString(iv))
                .put("ciphertext", Base64.getEncoder().encodeToString(ciphertext)));

        assertThat(service.decryptGrantPayload(legacyEnvelope)).isEqualTo(grantPayload);
    }
}
