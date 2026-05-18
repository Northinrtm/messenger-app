package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Payload used to change the authenticated user's password")
public record ChangePasswordRequest(
        @Schema(description = "Current password for verification")
        @NotBlank
        String currentPassword,
        @Schema(description = "New password that will replace the current one")
        @NotBlank
        @Size(min = 8, max = 120, message = "Password must be at least 8 characters long")
        String newPassword
) {
}
