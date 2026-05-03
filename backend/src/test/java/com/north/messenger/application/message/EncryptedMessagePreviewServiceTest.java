package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.e2ee.ChatHistoryKeyEscrowCryptoService;
import com.north.messenger.application.e2ee.E2eeEscrowProperties;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EncryptedMessagePreviewServiceTest {

    private static final String CHAT_EPOCH_SCHEME = "CHAT-EPOCH-KEY-AES-GCM";
    private static final String CHAT_EPOCH_CONTEXT = "north.chat-message.v1";
    private static final String MESSAGE_CONTENT_ENVELOPE_TYPE = "north.message.v1";
    private static final String GROUP_HISTORY_KEY_GRANT_CONTEXT = "north.group-history-key-grant.v1";

    private ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private ObjectMapper objectMapper;
    private EncryptedMessagePreviewService encryptedMessagePreviewService;
    private ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;

    @BeforeEach
    void setUp() {
        chatHistoryKeyEscrowRepository = mock(ChatHistoryKeyEscrowRepository.class);
        objectMapper = new ObjectMapper();
        chatHistoryKeyEscrowCryptoService = new ChatHistoryKeyEscrowCryptoService(
                objectMapper,
                new E2eeEscrowProperties(
                        Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8)),
                        false
                )
        );
        encryptedMessagePreviewService = new EncryptedMessagePreviewService(
                chatHistoryKeyEscrowRepository,
                chatHistoryKeyEscrowCryptoService,
                objectMapper
        );
    }

    @Test
    void summarizeMessagePreviewShouldDecryptChatEpochText() throws Exception {
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        UUID senderUserId = UUID.randomUUID();
        String historyKeyMaterial = Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));
        String createdAt = "2026-05-03T11:10:00Z";
        String messageRefId = "message-ref-id";
        String iv = Base64.getEncoder().encodeToString("123456789012".getBytes(StandardCharsets.UTF_8));
        String sharedEnvelope = createEncryptedSharedEnvelope(
                chatId,
                senderUserId,
                historyKeyId,
                historyKeyMaterial,
                "text/plain",
                "Preview text from the server side",
                messageRefId,
                createdAt,
                iv
        );

        when(chatHistoryKeyEscrowRepository.findByHistoryKeyId(eq(historyKeyId)))
                .thenReturn(Optional.of(createEscrow(chatId, historyKeyId, historyKeyMaterial, createdAt)));

        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderUserId,
                sharedEnvelope,
                CHAT_EPOCH_SCHEME,
                iv,
                historyKeyId,
                null,
                null,
                Instant.parse(createdAt)
        );

        assertThat(encryptedMessagePreviewService.summarizeMessagePreview(message))
                .isEqualTo("Preview text from the server side");
    }

    @Test
    void summarizeMessagePreviewShouldDescribeAttachmentOnlyMessage() throws Exception {
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        UUID senderUserId = UUID.randomUUID();
        String historyKeyMaterial = Base64.getEncoder().encodeToString("fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.UTF_8));
        String createdAt = "2026-05-03T11:15:00Z";
        String messageRefId = "attachment-ref-id";
        String iv = Base64.getEncoder().encodeToString("abcdefghijkl".getBytes(StandardCharsets.UTF_8));
        String contentEnvelope = """
                {"type":"north.message.v1","text":"","attachments":[{"fileName":"report.pdf"}]}
                """;
        String sharedEnvelope = createEncryptedSharedEnvelope(
                chatId,
                senderUserId,
                historyKeyId,
                historyKeyMaterial,
                MESSAGE_CONTENT_ENVELOPE_TYPE,
                contentEnvelope,
                messageRefId,
                createdAt,
                iv
        );

        when(chatHistoryKeyEscrowRepository.findByHistoryKeyId(eq(historyKeyId)))
                .thenReturn(Optional.of(createEscrow(chatId, historyKeyId, historyKeyMaterial, createdAt)));

        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderUserId,
                sharedEnvelope,
                CHAT_EPOCH_SCHEME,
                iv,
                historyKeyId,
                null,
                null,
                Instant.parse(createdAt)
        );

        assertThat(encryptedMessagePreviewService.summarizeMessagePreview(message))
                .isEqualTo("Файл: report.pdf");
    }

    private ChatHistoryKeyEscrow createEscrow(UUID chatId, UUID historyKeyId, String historyKeyMaterial, String createdAt)
            throws Exception {
        String grantPayload = objectMapper.createObjectNode()
                .put("aadVersion", 1)
                .put("context", GROUP_HISTORY_KEY_GRANT_CONTEXT)
                .put("chatId", chatId.toString())
                .put("historyKeyId", historyKeyId.toString())
                .put("historyKey", historyKeyMaterial)
                .put("membershipVersion", 0)
                .put("historyPolicy", "DIRECT")
                .put("createdAt", createdAt)
                .toString();
        String encryptedGrantPayload = chatHistoryKeyEscrowCryptoService.encryptGrantPayload(grantPayload);
        Instant timestamp = Instant.parse(createdAt);
        return new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                encryptedGrantPayload,
                timestamp,
                timestamp
        );
    }

    private String createEncryptedSharedEnvelope(
            UUID chatId,
            UUID senderUserId,
            UUID historyKeyId,
            String historyKeyMaterial,
            String contentType,
            String plaintext,
            String messageRefId,
            String createdAt,
            String iv
    ) throws Exception {
        String ciphertext = Base64.getEncoder().encodeToString(
                encryptChatEpochCiphertext(
                        historyKeyMaterial,
                        buildChatEpochEnvelopeAdditionalData(
                                chatId,
                                senderUserId,
                                historyKeyId,
                                messageRefId,
                                createdAt,
                                contentType,
                                iv
                        ),
                        plaintext,
                        iv
                )
        );

        return objectMapper.createObjectNode()
                .put("aadVersion", 1)
                .put("context", CHAT_EPOCH_CONTEXT)
                .put("chatId", chatId.toString())
                .put("senderUserId", senderUserId.toString())
                .put("historyKeyId", historyKeyId.toString())
                .put("membershipVersion", 0)
                .put("messageRefId", messageRefId)
                .put("createdAt", createdAt)
                .put("contentType", contentType)
                .put("ciphertext", ciphertext)
                .put("iv", iv)
                .toString();
    }

    private byte[] buildChatEpochEnvelopeAdditionalData(
            UUID chatId,
            UUID senderUserId,
            UUID historyKeyId,
            String messageRefId,
            String createdAt,
            String contentType,
            String iv
    ) {
        return objectMapper.createObjectNode()
                .put("aadVersion", 1)
                .put("context", CHAT_EPOCH_CONTEXT)
                .put("chatId", chatId.toString())
                .put("senderUserId", senderUserId.toString())
                .put("historyKeyId", historyKeyId.toString())
                .put("membershipVersion", 0)
                .put("messageRefId", messageRefId)
                .put("createdAt", createdAt)
                .put("contentType", contentType)
                .put("iv", iv)
                .toString()
                .getBytes(StandardCharsets.UTF_8);
    }

    private byte[] encryptChatEpochCiphertext(
            String historyKeyMaterial,
            byte[] additionalData,
            String plaintext,
            String iv
    ) throws Exception {
        SecretKeySpec historyKey = new SecretKeySpec(Base64.getDecoder().decode(historyKeyMaterial), "AES");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.ENCRYPT_MODE,
                historyKey,
                new GCMParameterSpec(128, Base64.getDecoder().decode(iv))
        );
        cipher.updateAAD(additionalData);
        return cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
    }
}
