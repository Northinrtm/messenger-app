package com.north.messenger.application.e2ee;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class AccountKeyWrapCryptoServiceTest {

    private static final String ACCOUNT_HISTORY_KEY_GRANT_CONTEXT = "north.account-history-key-grant.v2";
    private static final byte[] ACCOUNT_HISTORY_KEY_WRAP_LABEL =
            "north.account-history-key-grant.wrap.v2".getBytes(StandardCharsets.UTF_8);
    private static final OAEPParameterSpec OAEP_SHA256_PARAMETERS = new OAEPParameterSpec(
            "SHA-256",
            "MGF1",
            MGF1ParameterSpec.SHA256,
            new PSource.PSpecified(ACCOUNT_HISTORY_KEY_WRAP_LABEL)
    );

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AccountKeyWrapCryptoService service = new AccountKeyWrapCryptoService(objectMapper);

    @Test
    void wrapHistoryKeyGrantShouldUseHybridEnvelopeForLargePayload() throws Exception {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        KeyPair keyPair = keyPairGenerator.generateKeyPair();
        String publicKeyJwk = serializePublicKey((RSAPublicKey) keyPair.getPublic());
        String recipientUserId = "9e1667f8-68a5-414e-8609-72cc86679e56";
        String longGrantPayload = """
                {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"81b795ab-3b04-49fa-9e84-b2941d0c16af","historyKeyId":"f9ee3a01-67cb-4141-8df4-f5f79a0b78a8","historyKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","membershipVersion":4,"historyPolicy":"FULL_HISTORY","createdAt":"2026-05-02T11:12:09.000Z"}
                """;

        String wrappedGrantPayload = service.wrapHistoryKeyGrant(
                publicKeyJwk,
                java.util.UUID.fromString(recipientUserId),
                7L,
                longGrantPayload
        );

        JsonNode envelope = objectMapper.readTree(wrappedGrantPayload);
        assertThat(envelope.path("aadVersion").asInt()).isEqualTo(2);
        assertThat(envelope.path("context").asText()).isEqualTo(ACCOUNT_HISTORY_KEY_GRANT_CONTEXT);
        assertThat(envelope.path("chatId").asText()).isEqualTo("81b795ab-3b04-49fa-9e84-b2941d0c16af");
        assertThat(envelope.path("historyKeyId").asText()).isEqualTo("f9ee3a01-67cb-4141-8df4-f5f79a0b78a8");
        assertThat(envelope.path("recipientUserId").asText()).isEqualTo(recipientUserId);
        assertThat(envelope.path("recipientAccountKeyVersion").asLong()).isEqualTo(7L);
        assertThat(envelope.path("membershipVersion").asLong()).isEqualTo(4L);
        assertThat(envelope.path("historyPolicy").asText()).isEqualTo("FULL_HISTORY");
        assertThat(envelope.path("createdAt").asText()).isEqualTo("2026-05-02T11:12:09.000Z");
        assertThat(envelope.path("wrappedKey").asText()).isNotBlank();
        assertThat(envelope.path("iv").asText()).isNotBlank();
        assertThat(envelope.path("ciphertext").asText()).isNotBlank();

        Cipher wrappingCipher = Cipher.getInstance("RSA/ECB/OAEPPadding");
        wrappingCipher.init(Cipher.DECRYPT_MODE, keyPair.getPrivate(), OAEP_SHA256_PARAMETERS);
        byte[] wrappingKey = wrappingCipher.doFinal(Base64.getDecoder().decode(envelope.path("wrappedKey").asText()));

        Cipher grantCipher = Cipher.getInstance("AES/GCM/NoPadding");
        grantCipher.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(wrappingKey, "AES"),
                new GCMParameterSpec(128, Base64.getDecoder().decode(envelope.path("iv").asText()))
        );
        grantCipher.updateAAD(String.join(
                "\n",
                ACCOUNT_HISTORY_KEY_GRANT_CONTEXT,
                "2",
                envelope.path("chatId").asText(),
                envelope.path("historyKeyId").asText(),
                envelope.path("recipientUserId").asText(),
                Long.toString(envelope.path("recipientAccountKeyVersion").asLong()),
                Long.toString(envelope.path("membershipVersion").asLong()),
                envelope.path("historyPolicy").asText(),
                envelope.path("createdAt").asText()
        ).getBytes(StandardCharsets.UTF_8));
        String decryptedGrantPayload = new String(
                grantCipher.doFinal(Base64.getDecoder().decode(envelope.path("ciphertext").asText())),
                StandardCharsets.UTF_8
        );

        assertThat(decryptedGrantPayload).isEqualTo(longGrantPayload);
    }

    private String serializePublicKey(RSAPublicKey publicKey) throws Exception {
        JsonNode jwk = objectMapper.createObjectNode()
                .put("kty", "RSA")
                .put("n", Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.getModulus().toByteArray()))
                .put("e", Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.getPublicExponent().toByteArray()));
        return objectMapper.writeValueAsString(jwk);
    }
}
