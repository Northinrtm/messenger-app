package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Pattern;

public record UserEncryptionAccountKeyRequest(
        @NotBlank
        String publicKey,
        @Positive
        long accountKeyVersion,
        @Positive
        long identityGeneration,
        @NotBlank
        String identitySigningPublicKey,
        @NotBlank
        @Pattern(regexp = "RSA-PSS-SHA256")
        String identityKeyAlgorithm,
        @NotBlank
        @Pattern(regexp = "RSA-OAEP-3072-SHA256")
        String accountKeyAlgorithm,
        @NotBlank
        String signedAt,
        @NotBlank
        String signature
) {
}
