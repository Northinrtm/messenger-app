package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

@Schema(description = "Payload used to open or create a direct chat")
public record CreateDirectChatRequest(
        @Schema(description = "Username of the other participant")
        @NotBlank
        @Pattern(regexp = "^[a-zA-Z0-9_.-]{3,24}$", message = "Username must be 3-24 characters and use letters, numbers, dot, underscore or dash")
        String participantUsername
) {
}
