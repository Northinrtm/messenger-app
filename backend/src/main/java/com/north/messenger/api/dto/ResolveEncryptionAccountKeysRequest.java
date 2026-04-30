package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record ResolveEncryptionAccountKeysRequest(
        @NotEmpty
        List<UUID> userIds
) {
}
