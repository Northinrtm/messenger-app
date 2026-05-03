package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EncryptedMessagePayloadRequest(
        @NotBlank
        @Size(max = 120)
        String scheme,
        @Size(max = 20000)
        String sharedEnvelope
) {
}
