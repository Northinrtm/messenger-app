package com.north.messenger.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record UserEncryptionKeyBundleRequest(
        @NotBlank
        String publicKey,
        @NotBlank
        String encryptedPrivateKey,
        @NotBlank
        String kdfSalt,
        @NotBlank
        String kdfIv,
        @Min(100_000)
        @Max(1_000_000)
        int kdfIterations
) {
}
