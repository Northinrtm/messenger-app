package com.north.messenger.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record UpsertPendingOutgoingMessageRequest(
        @NotNull
        UUID chatId,
        @NotNull
        @Size(max = 20000)
        String content,
        @NotNull
        Instant createdAt,
        Long localOrder,
        @Min(0)
        @Max(10000)
        int recipientCount,
        MessageSnippetResponse replyTo,
        UUID forwardedFromMessageId,
        @NotBlank
        String status,
        List<PendingOutgoingMessageAttachmentPayload> attachments
) {
}
