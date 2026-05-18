package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "Payload that targets one group participant by username")
public record GroupParticipantActionRequest(
        @Schema(description = "Username of the participant to ban, unban, promote, or otherwise moderate")
        @NotBlank
        String username
) {
}
