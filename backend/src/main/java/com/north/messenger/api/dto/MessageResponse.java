package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        UUID chatId,
        Long serverOrder,
        ParticipantResponse sender,
        Instant createdAt,
        Instant editedAt,
        MessageStatusResponse status,
        String clientMessageId,
        MessageSnippetResponse replyTo,
        List<MessageReactionSummaryResponse> reactions,
        boolean forwarded,
        ForwardedMessageInfoResponse forwardedFrom,
        PlainMessagePayloadResponse plainPayload,
        List<ChatAttachmentResponse> attachments
) {
}

