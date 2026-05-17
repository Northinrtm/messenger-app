package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class MessagePreviewService {

    private static final String MESSAGE_PLACEHOLDER = "Message unavailable";
    private static final String FORWARDED_PREFIX = "\u041F\u0435\u0440\u0435\u0441\u043B\u0430\u043D\u043E: ";
    private static final String FORWARDED_PLACEHOLDER = "\u041F\u0435\u0440\u0435\u0441\u043B\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435";
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
        boolean forwardedCopy = message.getForwardedFromSenderId() != null;
        if (!normalized.isBlank()) {
            return forwardedCopy ? truncatePreview(FORWARDED_PREFIX + normalized) : normalized;
        }
        if (attachments.isEmpty()) {
            return forwardedCopy ? FORWARDED_PLACEHOLDER : MESSAGE_PLACEHOLDER;
        }
        if (attachments.size() == 1) {
            String preview = "File: " + attachments.get(0).getFileName();
            return forwardedCopy ? truncatePreview(FORWARDED_PREFIX + preview) : truncatePreview(preview);
        }
        String preview = "Files: " + attachments.size();
        return forwardedCopy ? truncatePreview(FORWARDED_PREFIX + preview) : truncatePreview(preview);
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
