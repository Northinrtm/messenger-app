package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record MigrateLegacyMessagesRequest(
        @NotEmpty
        List<@Valid LegacyMessageMigrationItemRequest> messages
) {
}
