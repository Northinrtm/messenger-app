package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record CreateMessageRequest(
        @NotBlank
        @Size(max = 120)
        String clientMessageId,
        UUID replyToMessageId,
        @Size(max = 10)
        List<UUID> attachmentIds,
        @Valid
        PlainMessagePayloadRequest plainPayload
) {
    public CreateMessageRequest(
            String clientMessageId,
            UUID replyToMessageId,
            PlainMessagePayloadRequest plainPayload
    ) {
        this(clientMessageId, replyToMessageId, null, plainPayload);
    }
}
