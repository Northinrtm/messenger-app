package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PendingOutgoingMessageResponse(
        UUID chatId,
        String clientMessageId,
        String content,
        Instant createdAt,
        Long localOrder,
        int recipientCount,
        MessageSnippetResponse replyTo,
        String status,
        Instant updatedAt,
        List<PendingOutgoingMessageAttachmentPayload> attachments
) {
}
