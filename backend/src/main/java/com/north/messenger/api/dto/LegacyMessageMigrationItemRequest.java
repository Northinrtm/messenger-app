package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record LegacyMessageMigrationItemRequest(
        @NotNull
        UUID messageId,
        @NotNull
        @Valid
        EncryptedMessagePayloadRequest encryptedPayload
) {
}
