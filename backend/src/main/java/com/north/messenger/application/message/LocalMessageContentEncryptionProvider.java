package com.north.messenger.application.message;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
class LocalMessageContentEncryptionProvider implements MessageContentEncryptionProvider {

    private static final String PROVIDER_NAME = "LOCAL";
    private static final String KEY_REFERENCE = "local-master-key";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_LENGTH_BYTES = 12;
    private static final byte[] DEFAULT_MASTER_KEY =
            "01234567890123456789012345678901".getBytes(java.nio.charset.StandardCharsets.UTF_8);

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKey masterKey;

    LocalMessageContentEncryptionProvider(MessageContentEncryptionProperties properties) {
        byte[] keyBytes = properties.localMasterKeyBase64().isBlank()
                ? DEFAULT_MASTER_KEY
                : Base64.getDecoder().decode(properties.localMasterKeyBase64());
        if (keyBytes.length != 32) {
            throw new IllegalStateException("Local message content master key must be 32 bytes");
        }
        this.masterKey = new SecretKeySpec(keyBytes, "AES");
    }

    @Override
    public String providerName() {
        return PROVIDER_NAME;
    }

    @Override
    public GeneratedDataKey generateDataKey() {
        byte[] keyBytes = new byte[32];
        secureRandom.nextBytes(keyBytes);
        SecretKey plaintextKey = new SecretKeySpec(keyBytes, "AES");
        return new GeneratedDataKey(encryptKeyBytes(keyBytes), plaintextKey, KEY_REFERENCE);
    }

    @Override
    public SecretKey unwrapDataKey(byte[] encryptedDataKey, String keyReference) {
        if (!KEY_REFERENCE.equals(keyReference)) {
            throw new IllegalStateException("Unsupported local message key reference: " + keyReference);
        }
        return new SecretKeySpec(decryptKeyBytes(encryptedDataKey), "AES");
    }

    private byte[] encryptKeyBytes(byte[] plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, masterKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(iv.length + ciphertext.length)
                    .put(iv)
                    .put(ciphertext)
                    .array();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to encrypt local message data key", exception);
        }
    }

    private byte[] decryptKeyBytes(byte[] encryptedDataKey) {
        try {
            ByteBuffer buffer = ByteBuffer.wrap(encryptedDataKey);
            byte[] iv = new byte[IV_LENGTH_BYTES];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, masterKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            return cipher.doFinal(ciphertext);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to decrypt local message data key", exception);
        }
    }
}
