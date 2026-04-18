package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record ResolveEncryptionDeviceBundlesRequest(
        @NotEmpty
        @Size(max = 100)
        List<UUID> userIds,
        @Size(max = 256)
        List<UUID> deviceIds,
        Boolean consumeOneTimePrekeys,
        UUID requesterDeviceId
) {
}
