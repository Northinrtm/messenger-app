package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.io.Decoders;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class ChatHistoryKeyEscrowCryptoService {

    private static final int LEGACY_AAD_VERSION = 1;
    private static final int AAD_VERSION = 2;
    private static final String ESCROW_CONTEXT = "north.chat-history-escrow.v2";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final ObjectMapper objectMapper;
    private final SecretKeySpec escrowKey;
    private final SecureRandom secureRandom = new SecureRandom();

    public ChatHistoryKeyEscrowCryptoService(ObjectMapper objectMapper, E2eeEscrowProperties escrowProperties) {
        this.objectMapper = objectMapper;
        this.escrowKey = new SecretKeySpec(resolveEscrowKey(escrowProperties), "AES");
    }

    public String encryptGrantPayload(String grantPayloadJson) {
        try {
            EscrowGrantContext grantContext = parseGrantContext(grantPayloadJson);
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, escrowKey, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(buildAdditionalData(grantContext));
            byte[] ciphertext = cipher.doFinal(grantPayloadJson.getBytes(StandardCharsets.UTF_8));

            JsonNode payload = objectMapper.createObjectNode()
                    .put("aadVersion", AAD_VERSION)
                    .put("context", ESCROW_CONTEXT)
                    .put("chatId", grantContext.chatId())
                    .put("historyKeyId", grantContext.historyKeyId())
                    .put("membershipVersion", grantContext.membershipVersion())
                    .put("historyPolicy", grantContext.historyPolicy())
                    .put("createdAt", grantContext.createdAt())
                    .put("iv", Base64.getEncoder().encodeToString(iv))
                    .put("ciphertext", Base64.getEncoder().encodeToString(ciphertext));
            return objectMapper.writeValueAsString(payload);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to encrypt chat history escrow payload", exception);
        }
    }

    public String decryptGrantPayload(String encryptedGrantPayloadJson) {
        try {
            JsonNode payload = objectMapper.readTree(encryptedGrantPayloadJson);
            int aadVersion = payload.path("aadVersion").asInt(-1);
            if (aadVersion != LEGACY_AAD_VERSION && aadVersion != AAD_VERSION) {
                throw new IllegalStateException("Unsupported chat history escrow payload version");
            }

            byte[] iv = Base64.getDecoder().decode(payload.path("iv").asText());
            byte[] ciphertext = Base64.getDecoder().decode(payload.path("ciphertext").asText());
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, escrowKey, new GCMParameterSpec(TAG_BITS, iv));
            if (aadVersion == AAD_VERSION) {
                EscrowGrantContext grantContext = requireEnvelopeGrantContext(payload);
                cipher.updateAAD(buildAdditionalData(grantContext));
                String decryptedGrantPayload = new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
                EscrowGrantContext decryptedContext = parseGrantContext(decryptedGrantPayload);
                if (!grantContext.equals(decryptedContext)) {
                    throw new IllegalStateException("Escrow payload metadata does not match encrypted grant payload");
                }
                return decryptedGrantPayload;
            }

            cipher.updateAAD(String.valueOf(LEGACY_AAD_VERSION).getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to decrypt chat history escrow payload", exception);
        }
    }

    private EscrowGrantContext parseGrantContext(String grantPayloadJson) throws Exception {
        JsonNode payload = objectMapper.readTree(grantPayloadJson);
        if (payload.path("aadVersion").asInt(-1) != 1) {
            throw new IllegalStateException("Unsupported group history escrow grant payload");
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
            throw new IllegalStateException("Group history escrow grant payload is incomplete");
        }

        return new EscrowGrantContext(chatId, historyKeyId, membershipVersion, historyPolicy, createdAt);
    }

    private EscrowGrantContext requireEnvelopeGrantContext(JsonNode payload) {
        String context = payload.path("context").asText();
        String chatId = payload.path("chatId").asText();
        String historyKeyId = payload.path("historyKeyId").asText();
        long membershipVersion = payload.path("membershipVersion").asLong(-1L);
        String historyPolicy = payload.path("historyPolicy").asText();
        String createdAt = payload.path("createdAt").asText();
        if (!ESCROW_CONTEXT.equals(context)
                || chatId == null || chatId.isBlank()
                || historyKeyId == null || historyKeyId.isBlank()
                || membershipVersion < 0
                || historyPolicy == null || historyPolicy.isBlank()
                || createdAt == null || createdAt.isBlank()) {
            throw new IllegalStateException("Chat history escrow payload metadata is incomplete");
        }

        return new EscrowGrantContext(chatId, historyKeyId, membershipVersion, historyPolicy, createdAt);
    }

    private byte[] buildAdditionalData(EscrowGrantContext grantContext) {
        return String.join(
                "\n",
                ESCROW_CONTEXT,
                String.valueOf(AAD_VERSION),
                grantContext.chatId(),
                grantContext.historyKeyId(),
                Long.toString(grantContext.membershipVersion()),
                grantContext.historyPolicy(),
                grantContext.createdAt()
        ).getBytes(StandardCharsets.UTF_8);
    }

    private byte[] resolveEscrowKey(E2eeEscrowProperties escrowProperties) {
        String configuredSecret = escrowProperties.secret();
        if (configuredSecret != null && !configuredSecret.isBlank()) {
            return Decoders.BASE64.decode(configuredSecret);
        }

        byte[] generatedSecret = new byte[32];
        secureRandom.nextBytes(generatedSecret);
        return generatedSecret;
    }

    private record EscrowGrantContext(
            String chatId,
            String historyKeyId,
            long membershipVersion,
            String historyPolicy,
            String createdAt
    ) {
    }
}
