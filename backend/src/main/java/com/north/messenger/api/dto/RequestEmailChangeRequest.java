package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Request to change the authenticated user's email address")
public record RequestEmailChangeRequest(
        @Schema(description = "The new email address to change to")
        @NotBlank
        @Size(max = 320, message = "Email must be 320 characters or fewer")
        String newEmail
) {
}
