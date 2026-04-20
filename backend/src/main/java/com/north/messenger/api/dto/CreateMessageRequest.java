package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateMessageRequest(
        @NotBlank
        @Size(max = 120)
        String clientMessageId,
        java.util.UUID replyToMessageId,
        @NotNull
        @Valid
        EncryptedMessagePayloadRequest encryptedPayload
) {
}
