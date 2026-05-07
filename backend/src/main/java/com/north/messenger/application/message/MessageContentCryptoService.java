package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatMessage;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Collection;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import org.springframework.stereotype.Service;

@Service
class MessageContentCryptoService {

    private static final String ALGORITHM = "AES_256_GCM";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_LENGTH_BYTES = 12;

    private final SecureRandom secureRandom = new SecureRandom();
    private final ChatMessageContentKeyService chatMessageContentKeyService;

    MessageContentCryptoService(ChatMessageContentKeyService chatMessageContentKeyService) {
        this.chatMessageContentKeyService = chatMessageContentKeyService;
    }

    EncryptedMessageContent encrypt(java.util.UUID chatId, java.util.UUID messageId, java.util.UUID senderId, String plaintext) {
        ChatMessageContentKeyService.ResolvedMessageKey resolvedKey =
                chatMessageContentKeyService.getOrCreateActiveKey(chatId);
        byte[] iv = new byte[IV_LENGTH_BYTES];
        secureRandom.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, resolvedKey.secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipher.updateAAD(buildAad(chatId, messageId, senderId, resolvedKey.keyVersion()));
            return new EncryptedMessageContent(
                    cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)),
                    iv,
                    resolvedKey.keyVersion(),
                    ALGORITHM
            );
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to encrypt message content", exception);
        }
    }

    String requirePlainContent(ChatMessage message) {
        if (message == null) {
            return null;
        }
        if (message.getContent() != null) {
            return message.getContent();
        }
        if (message.getContentCiphertext() == null
                || message.getContentIv() == null
                || message.getContentAlgorithm() == null
                || message.getContentKeyVersion() <= 0) {
            return null;
        }
        if (!ALGORITHM.equals(message.getContentAlgorithm())) {
            throw new IllegalStateException(
                    "Unsupported message content algorithm %s for messageId=%s"
                            .formatted(message.getContentAlgorithm(), message.getId())
            );
        }
        ChatMessageContentKeyService.ResolvedMessageKey resolvedKey =
                chatMessageContentKeyService.resolveKey(message.getChatId(), message.getContentKeyVersion());
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    resolvedKey.secretKey(),
                    new GCMParameterSpec(GCM_TAG_BITS, message.getContentIv())
            );
            cipher.updateAAD(buildAad(
                    message.getChatId(),
                    message.getId(),
                    message.getSenderId(),
                    message.getContentKeyVersion()
            ));
            String plaintext = new String(cipher.doFinal(message.getContentCiphertext()), StandardCharsets.UTF_8);
            message.cacheDecryptedContent(plaintext);
            return plaintext;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException(
                    "Failed to decrypt message content for messageId=" + message.getId(),
                    exception
            );
        }
    }

    void hydrateContents(Collection<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        messages.forEach(this::requirePlainContent);
    }

    private byte[] buildAad(java.util.UUID chatId, java.util.UUID messageId, java.util.UUID senderId, int keyVersion) {
        return (chatId + "|" + messageId + "|" + senderId + "|" + keyVersion)
                .getBytes(StandardCharsets.UTF_8);
    }
}
