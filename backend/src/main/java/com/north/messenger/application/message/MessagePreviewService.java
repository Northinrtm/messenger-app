package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class MessagePreviewService {

    private static final String MESSAGE_PLACEHOLDER = "Message unavailable";
    private static final int PREVIEW_MAX_LENGTH = 88;

    private final ChatAttachmentRepository chatAttachmentRepository;
    private final MessageContentCryptoService messageContentCryptoService;

    public MessagePreviewService(
            ChatAttachmentRepository chatAttachmentRepository,
            MessageContentCryptoService messageContentCryptoService
    ) {
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.messageContentCryptoService = messageContentCryptoService;
    }

    public String summarizeMessagePreview(ChatMessage message) {
        if (message == null) {
            return MESSAGE_PLACEHOLDER;
        }

        List<ChatAttachment> attachments = message.getId() == null
                ? List.of()
                : chatAttachmentRepository.findAllByMessageId(message.getId());
        return summarizeMessagePreview(message, attachments);
    }

    public String summarizeMessagePreview(ChatMessage message, List<ChatAttachment> attachments) {
        if (message == null) {
            return MESSAGE_PLACEHOLDER;
        }

        String normalized = normalizePreviewText(messageContentCryptoService.requirePlainContent(message));
        if (!normalized.isBlank()) {
            return normalized;
        }
        if (attachments.isEmpty()) {
            return MESSAGE_PLACEHOLDER;
        }
        if (attachments.size() == 1) {
            return truncatePreview("File: " + attachments.get(0).getFileName());
        }
        return truncatePreview("Files: " + attachments.size());
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

}
