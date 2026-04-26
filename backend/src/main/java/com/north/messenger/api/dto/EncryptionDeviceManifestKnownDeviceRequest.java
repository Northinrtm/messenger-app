package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record EncryptionDeviceManifestKnownDeviceRequest(
        @NotNull
        UUID deviceId,
        @NotBlank
        @Size(max = 128)
        String version
) {
}
