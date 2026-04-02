package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record UpdateMessageRequest(
        @NotNull
        @Valid
        EncryptedMessagePayloadRequest encryptedPayload
) {
}
