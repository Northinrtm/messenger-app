package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.e2ee.ChatHistoryKeyEscrowCryptoService;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class EncryptedMessagePreviewService {

    private static final String ENCRYPTED_MESSAGE_PLACEHOLDER = "Encrypted message";
    private static final String CHAT_EPOCH_SCHEME = "CHAT-EPOCH-KEY-AES-GCM";
    private static final int CHAT_EPOCH_ENVELOPE_AAD_VERSION = 1;
    private static final String CHAT_EPOCH_ENVELOPE_CONTEXT = "north.chat-message.v1";
    private static final String MESSAGE_CONTENT_ENVELOPE_TYPE = "north.message.v1";
    private static final String GROUP_HISTORY_KEY_GRANT_CONTEXT = "north.group-history-key-grant.v1";
    private static final int GROUP_HISTORY_KEY_GRANT_AAD_VERSION = 1;
    private static final int PREVIEW_MAX_LENGTH = 88;
    private static final int GCM_TAG_BITS = 128;

    private final ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private final ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;
    private final ObjectMapper objectMapper;
    private final E2eePreviewProperties previewProperties;

    public EncryptedMessagePreviewService(
            ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository,
            ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService,
            ObjectMapper objectMapper,
            E2eePreviewProperties previewProperties
    ) {
        this.chatHistoryKeyEscrowRepository = chatHistoryKeyEscrowRepository;
        this.chatHistoryKeyEscrowCryptoService = chatHistoryKeyEscrowCryptoService;
        this.objectMapper = objectMapper;
        this.previewProperties = previewProperties;
    }

    public String summarizeMessagePreview(ChatMessage message) {
        if (message == null) {
            return ENCRYPTED_MESSAGE_PLACEHOLDER;
        }

        if (!message.isEncrypted()) {
            return truncatePreview(message.getContent());
        }
        if (!previewProperties.decryptServerSide()) {
            return ENCRYPTED_MESSAGE_PLACEHOLDER;
        }

        if (!CHAT_EPOCH_SCHEME.equals(message.getEncryptionScheme())
                || message.getHistoryKeyId() == null
                || message.getContent() == null
                || message.getContent().isBlank()) {
            return ENCRYPTED_MESSAGE_PLACEHOLDER;
        }

        try {
            ChatEpochEnvelope envelope = parseChatEpochEnvelope(message.getContent());
            if (!message.getChatId().equals(envelope.chatId()) || !message.getHistoryKeyId().equals(envelope.historyKeyId())) {
                return ENCRYPTED_MESSAGE_PLACEHOLDER;
            }

            String historyKeyMaterial = resolveHistoryKeyMaterial(message.getHistoryKeyId(), message.getChatId());
            if (historyKeyMaterial == null || historyKeyMaterial.isBlank()) {
                return ENCRYPTED_MESSAGE_PLACEHOLDER;
            }

            String plaintext = decryptChatEpochEnvelopeContent(envelope, historyKeyMaterial);
            return summarizeDecryptedContent(plaintext, envelope.contentType());
        } catch (Exception exception) {
            return ENCRYPTED_MESSAGE_PLACEHOLDER;
        }
    }

    private String resolveHistoryKeyMaterial(UUID historyKeyId, UUID chatId) throws Exception {
        ChatHistoryKeyEscrow escrow = chatHistoryKeyEscrowRepository.findByHistoryKeyId(historyKeyId).orElse(null);
        if (escrow == null) {
            return null;
        }

        String decryptedGrantPayload = chatHistoryKeyEscrowCryptoService.decryptGrantPayload(
                escrow.getEncryptedGrantPayloadJson()
        );
        JsonNode payload = objectMapper.readTree(decryptedGrantPayload);
        if (payload.path("aadVersion").asInt(-1) != GROUP_HISTORY_KEY_GRANT_AAD_VERSION
                || !GROUP_HISTORY_KEY_GRANT_CONTEXT.equals(payload.path("context").asText())
                || !chatId.toString().equals(payload.path("chatId").asText())
                || !historyKeyId.toString().equals(payload.path("historyKeyId").asText())) {
            return null;
        }

        String historyKey = payload.path("historyKey").asText();
        return historyKey == null || historyKey.isBlank() ? null : historyKey;
    }

    private String decryptChatEpochEnvelopeContent(ChatEpochEnvelope envelope, String historyKeyMaterial)
            throws GeneralSecurityException {
        SecretKeySpec historyKey = new SecretKeySpec(Base64.getDecoder().decode(historyKeyMaterial), "AES");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.DECRYPT_MODE,
                historyKey,
                new GCMParameterSpec(GCM_TAG_BITS, Base64.getDecoder().decode(envelope.iv()))
        );
        cipher.updateAAD(buildChatEpochEnvelopeAdditionalData(envelope));
        byte[] plaintext = cipher.doFinal(Base64.getDecoder().decode(envelope.ciphertext()));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private byte[] buildChatEpochEnvelopeAdditionalData(ChatEpochEnvelope envelope) {
        return objectMapper.createObjectNode()
                .put("aadVersion", envelope.aadVersion())
                .put("context", envelope.context())
                .put("chatId", envelope.chatId().toString())
                .put("senderUserId", envelope.senderUserId().toString())
                .put("historyKeyId", envelope.historyKeyId().toString())
                .put("membershipVersion", envelope.membershipVersion())
                .put("messageRefId", envelope.messageRefId())
                .put("createdAt", envelope.createdAt().toString())
                .put("contentType", envelope.contentType())
                .put("iv", envelope.iv())
                .toString()
                .getBytes(StandardCharsets.UTF_8);
    }

    private String summarizeDecryptedContent(String plaintext, String contentType) throws Exception {
        String content = plaintext == null ? "" : plaintext;
        List<AttachmentPreview> attachments = List.of();
        if (MESSAGE_CONTENT_ENVELOPE_TYPE.equals(contentType)) {
            JsonNode payload = objectMapper.readTree(plaintext);
            if (MESSAGE_CONTENT_ENVELOPE_TYPE.equals(payload.path("type").asText())
                    && payload.path("text").isTextual()) {
                content = payload.path("text").asText();
                attachments = parseAttachments(payload.path("attachments"));
            }
        }

        String normalized = normalizePreviewText(content);
        if (!normalized.isBlank()) {
            return normalized;
        }
        if (attachments.isEmpty()) {
            return ENCRYPTED_MESSAGE_PLACEHOLDER;
        }
        if (attachments.size() == 1) {
            return truncatePreview("Файл: " + attachments.get(0).fileName());
        }
        return truncatePreview("Файлы: " + attachments.size());
    }

    private List<AttachmentPreview> parseAttachments(JsonNode attachmentsNode) {
        if (attachmentsNode == null || !attachmentsNode.isArray()) {
            return List.of();
        }

        return java.util.stream.StreamSupport.stream(attachmentsNode.spliterator(), false)
                .map(node -> {
                    String fileName = node.path("fileName").asText();
                    if (fileName == null || fileName.isBlank()) {
                        return null;
                    }
                    return new AttachmentPreview(fileName.trim());
                })
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private String normalizePreviewText(String content) {
        if (content == null) {
            return "";
        }
        return truncatePreview(content.trim().replaceAll("\\s+", " "));
    }

    private String truncatePreview(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        if (normalized.length() <= PREVIEW_MAX_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, PREVIEW_MAX_LENGTH - 3) + "...";
    }

    private ChatEpochEnvelope parseChatEpochEnvelope(String serializedEnvelope) throws Exception {
        JsonNode envelope = objectMapper.readTree(serializedEnvelope);
        if (envelope.path("aadVersion").asInt(-1) != CHAT_EPOCH_ENVELOPE_AAD_VERSION
                || !CHAT_EPOCH_ENVELOPE_CONTEXT.equals(envelope.path("context").asText())
                || !envelope.path("chatId").isTextual()
                || !envelope.path("senderUserId").isTextual()
                || !envelope.path("historyKeyId").isTextual()
                || envelope.path("membershipVersion").asLong(-1L) < 0
                || !envelope.path("messageRefId").isTextual()
                || !envelope.path("createdAt").isTextual()
                || !envelope.path("contentType").isTextual()
                || !envelope.path("ciphertext").isTextual()
                || !envelope.path("iv").isTextual()) {
            throw new IllegalStateException("Malformed chat epoch envelope");
        }

        Instant createdAt = Instant.parse(envelope.path("createdAt").asText());
        return new ChatEpochEnvelope(
                envelope.path("aadVersion").asInt(),
                envelope.path("context").asText(),
                UUID.fromString(envelope.path("chatId").asText()),
                UUID.fromString(envelope.path("senderUserId").asText()),
                UUID.fromString(envelope.path("historyKeyId").asText()),
                envelope.path("membershipVersion").asLong(),
                envelope.path("messageRefId").asText(),
                createdAt,
                envelope.path("contentType").asText(),
                envelope.path("ciphertext").asText(),
                envelope.path("iv").asText()
        );
    }

    private record ChatEpochEnvelope(
            int aadVersion,
            String context,
            UUID chatId,
            UUID senderUserId,
            UUID historyKeyId,
            long membershipVersion,
            String messageRefId,
            Instant createdAt,
            String contentType,
            String ciphertext,
            String iv
    ) {
    }

    private record AttachmentPreview(String fileName) {
    }
}
