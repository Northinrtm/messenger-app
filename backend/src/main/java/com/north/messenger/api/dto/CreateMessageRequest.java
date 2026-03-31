package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CreateMessageRequest(
        @NotNull
        @Valid
        EncryptedMessagePayloadRequest encryptedPayload
) {
}
