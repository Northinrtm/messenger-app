package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateMessageRequest(
        @Size(max = 120)
        String clientMessageId,
        @NotNull
        @Valid
        EncryptedMessagePayloadRequest encryptedPayload
) {
}
