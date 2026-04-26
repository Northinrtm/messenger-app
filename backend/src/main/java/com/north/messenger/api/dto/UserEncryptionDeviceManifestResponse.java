package com.north.messenger.api.dto;

import java.util.List;
import java.util.UUID;

public record UserEncryptionDeviceManifestResponse(
        String version,
        boolean fullSync,
        List<UserEncryptionDeviceBundleResponse> bundles,
        List<UUID> removedDeviceIds
) {
}
