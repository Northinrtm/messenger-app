package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record ResolveEncryptionDeviceManifestRequest(
        @NotEmpty
        @Size(max = 100)
        List<UUID> userIds,
        @Size(max = 256)
        List<UUID> deviceIds,
        @Valid
        @Size(max = 512)
        List<EncryptionDeviceManifestKnownDeviceRequest> knownDevices,
        @Size(max = 128)
        String knownVersion
) {
}
