package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class AccountKeyWrapCryptoService {

    private static final int ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION = 2;
    private static final String ACCOUNT_HISTORY_KEY_GRANT_CONTEXT = "north.account-history-key-grant.v2";
    private static final int MIN_RSA_MODULUS_BITS = 3072;
    private static final BigInteger REQUIRED_RSA_PUBLIC_EXPONENT = BigInteger.valueOf(65537L);
    private static final byte[] ACCOUNT_HISTORY_KEY_WRAP_LABEL =
            "north.account-history-key-grant.wrap.v2".getBytes(StandardCharsets.UTF_8);
    private static final int WRAPPING_KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final OAEPParameterSpec OAEP_SHA256_PARAMETERS = new OAEPParameterSpec(
            "SHA-256",
            "MGF1",
            MGF1ParameterSpec.SHA256,
            new PSource.PSpecified(ACCOUNT_HISTORY_KEY_WRAP_LABEL)
    );

    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public AccountKeyWrapCryptoService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String wrapHistoryKeyGrant(
            String serializedAccountPublicKey,
            UUID recipientUserId,
            long recipientAccountKeyVersion,
            String grantPayloadJson
    ) {
        try {
            PublicKey publicKey = parseAccountPublicKey(serializedAccountPublicKey);
            AccountHistoryKeyGrantContext grantContext = parseGrantContext(grantPayloadJson);
            byte[] wrappingKey = new byte[WRAPPING_KEY_BYTES];
            secureRandom.nextBytes(wrappingKey);
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);

            Cipher grantCipher = Cipher.getInstance("AES/GCM/NoPadding");
            grantCipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(wrappingKey, "AES"),
                    new GCMParameterSpec(TAG_BITS, iv)
            );
            grantCipher.updateAAD(buildAdditionalData(
                    grantContext,
                    recipientUserId,
                    recipientAccountKeyVersion
            ));
            byte[] ciphertext = grantCipher.doFinal(grantPayloadJson.getBytes(StandardCharsets.UTF_8));

            Cipher wrappingCipher = Cipher.getInstance("RSA/ECB/OAEPPadding");
            wrappingCipher.init(Cipher.ENCRYPT_MODE, publicKey, OAEP_SHA256_PARAMETERS);
            byte[] wrappedKey = wrappingCipher.doFinal(wrappingKey);

            JsonNode envelope = objectMapper.createObjectNode()
                    .put("aadVersion", ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION)
                    .put("context", ACCOUNT_HISTORY_KEY_GRANT_CONTEXT)
                    .put("chatId", grantContext.chatId())
                    .put("historyKeyId", grantContext.historyKeyId())
                    .put("recipientUserId", recipientUserId.toString())
                    .put("recipientAccountKeyVersion", recipientAccountKeyVersion)
                    .put("membershipVersion", grantContext.membershipVersion())
                    .put("historyPolicy", grantContext.historyPolicy())
                    .put("createdAt", grantContext.createdAt())
                    .put("wrappedKey", Base64.getEncoder().encodeToString(wrappedKey))
                    .put("iv", Base64.getEncoder().encodeToString(iv))
                    .put("ciphertext", Base64.getEncoder().encodeToString(ciphertext));
            return objectMapper.writeValueAsString(envelope);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to wrap group history key grant", exception);
        }
    }

    private AccountHistoryKeyGrantContext parseGrantContext(String grantPayloadJson) throws Exception {
        JsonNode payload = objectMapper.readTree(grantPayloadJson);
        if (payload.path("aadVersion").asInt(-1) != 1) {
            throw new IllegalStateException("Unsupported group history grant payload");
        }

        String chatId = payload.path("chatId").asText();
        String historyKeyId = payload.path("historyKeyId").asText();
        long membershipVersion = payload.path("membershipVersion").asLong(-1L);
        String historyPolicy = payload.path("historyPolicy").asText();
        String createdAt = payload.path("createdAt").asText();
        if (chatId == null || chatId.isBlank()
                || historyKeyId == null || historyKeyId.isBlank()
                || membershipVersion < 0
                || historyPolicy == null || historyPolicy.isBlank()
                || createdAt == null || createdAt.isBlank()) {
            throw new IllegalStateException("Group history grant payload is incomplete");
        }

        return new AccountHistoryKeyGrantContext(chatId, historyKeyId, membershipVersion, historyPolicy, createdAt);
    }

    private byte[] buildAdditionalData(
            AccountHistoryKeyGrantContext grantContext,
            UUID recipientUserId,
            long recipientAccountKeyVersion
    ) {
        return String.join(
                "\n",
                ACCOUNT_HISTORY_KEY_GRANT_CONTEXT,
                String.valueOf(ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION),
                grantContext.chatId(),
                grantContext.historyKeyId(),
                recipientUserId.toString(),
                Long.toString(recipientAccountKeyVersion),
                Long.toString(grantContext.membershipVersion()),
                grantContext.historyPolicy(),
                grantContext.createdAt()
        ).getBytes(StandardCharsets.UTF_8);
    }

    private PublicKey parseAccountPublicKey(String serializedAccountPublicKey) throws Exception {
        JsonNode jwk = objectMapper.readTree(serializedAccountPublicKey);
        if (!"RSA".equals(jwk.path("kty").asText())) {
            throw new IllegalStateException("Unsupported account public key type");
        }

        String modulus = jwk.path("n").asText();
        String exponent = jwk.path("e").asText();
        if (modulus == null || modulus.isBlank() || exponent == null || exponent.isBlank()) {
            throw new IllegalStateException("Account public key is malformed");
        }

        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        BigInteger parsedModulus = new BigInteger(1, decodeBase64Url(modulus));
        BigInteger parsedExponent = new BigInteger(1, decodeBase64Url(exponent));
        if (parsedModulus.bitLength() < MIN_RSA_MODULUS_BITS) {
            throw new IllegalStateException("Account public key must use at least 3072-bit RSA modulus");
        }
        if (!REQUIRED_RSA_PUBLIC_EXPONENT.equals(parsedExponent)) {
            throw new IllegalStateException("Account public key must use RSA public exponent 65537");
        }
        return keyFactory.generatePublic(new RSAPublicKeySpec(
                parsedModulus,
                parsedExponent
        ));
    }

    private byte[] decodeBase64Url(String value) {
        int requiredPadding = (4 - (value.length() % 4)) % 4;
        String paddedValue = value + "=".repeat(requiredPadding);
        return Base64.getUrlDecoder().decode(paddedValue);
    }

    private record AccountHistoryKeyGrantContext(
            String chatId,
            String historyKeyId,
            long membershipVersion,
            String historyPolicy,
            String createdAt
    ) {
    }
}
