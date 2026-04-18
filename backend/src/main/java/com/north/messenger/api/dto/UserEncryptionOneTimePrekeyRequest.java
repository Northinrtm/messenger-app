package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserEncryptionOneTimePrekeyRequest(
        @NotNull Integer keyId,
        @NotBlank
        @Size(max = 1024)
        String publicKey
) {
}
