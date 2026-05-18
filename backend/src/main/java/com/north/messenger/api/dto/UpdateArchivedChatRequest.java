package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

@Schema(description = "Archive-state toggle for one chat")
public record UpdateArchivedChatRequest(
        @Schema(description = "True to archive the chat for the current user, false to restore it")
        @NotNull(message = "archived is required")
        Boolean archived
) {
}
