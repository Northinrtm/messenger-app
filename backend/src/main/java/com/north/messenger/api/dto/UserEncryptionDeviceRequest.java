package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record UserEncryptionDeviceRequest(
        UUID deviceId,
        @NotBlank
        @Size(max = 1024)
        String identityKey,
        @NotBlank
        @Size(max = 32)
        String identityKeyAlgorithm,
        @NotBlank
        @Size(max = 1024)
        String identitySignatureKey,
        @NotBlank
        @Size(max = 32)
        String identitySignatureKeyAlgorithm,
        @NotNull Integer signedPrekeyId,
        @NotBlank
        @Size(max = 1024)
        String signedPrekeyPublicKey,
        @NotBlank
        @Size(max = 512)
        String signedPrekeySignature,
        @NotBlank
        @Size(max = 32)
        String signedPrekeyAlgorithm,
        @NotEmpty
        @Size(max = 256)
        List<@Valid UserEncryptionOneTimePrekeyRequest> oneTimePrekeys
) {
}
