package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.security.JwtService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class ChatHistoryKeyEscrowCryptoService {

    private static final int AAD_VERSION = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final ObjectMapper objectMapper;
    private final SecretKeySpec escrowKey;
    private final SecureRandom secureRandom = new SecureRandom();

    public ChatHistoryKeyEscrowCryptoService(ObjectMapper objectMapper, JwtService jwtService) {
        this.objectMapper = objectMapper;
        this.escrowKey = new SecretKeySpec(deriveEscrowKey(jwtService.exportSigningKeyMaterial()), "AES");
    }

    public String encryptGrantPayload(String grantPayloadJson) {
        try {
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, escrowKey, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(String.valueOf(AAD_VERSION).getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(grantPayloadJson.getBytes(StandardCharsets.UTF_8));

            JsonNode payload = objectMapper.createObjectNode()
                    .put("aadVersion", AAD_VERSION)
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
            if (payload.path("aadVersion").asInt(-1) != AAD_VERSION) {
                throw new IllegalStateException("Unsupported chat history escrow payload version");
            }

            byte[] iv = Base64.getDecoder().decode(payload.path("iv").asText());
            byte[] ciphertext = Base64.getDecoder().decode(payload.path("ciphertext").asText());
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, escrowKey, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(String.valueOf(AAD_VERSION).getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to decrypt chat history escrow payload", exception);
        }
    }

    private static byte[] deriveEscrowKey(byte[] signingKeyBytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(signingKeyBytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
