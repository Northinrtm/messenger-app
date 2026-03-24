package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateArchivedChatRequest(
        @NotNull(message = "archived is required")
        Boolean archived
) {
}
