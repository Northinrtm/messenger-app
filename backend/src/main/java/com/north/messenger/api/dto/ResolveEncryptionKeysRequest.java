package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record ResolveEncryptionKeysRequest(
        @NotNull
        List<UUID> userIds
) {
}
