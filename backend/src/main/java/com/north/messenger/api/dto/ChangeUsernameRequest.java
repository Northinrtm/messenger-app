package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Payload used to change the authenticated user's username")
public record ChangeUsernameRequest(
        @Schema(description = "New username (3-24 chars, starts with a letter, only lowercase letters/numbers/underscore)")
        @NotBlank
        @Size(min = 3, max = 24, message = "Username must be 3-24 characters")
        String newUsername
) {
}
