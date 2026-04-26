package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record DeleteMessagesRequest(
        @NotEmpty List<@NotNull UUID> messageIds
) {
}
