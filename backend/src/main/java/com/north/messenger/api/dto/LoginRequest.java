package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "Credentials used for browser or mobile login")
public record LoginRequest(
        @Schema(description = "Username or email login identifier")
        @NotBlank String username,
        @Schema(description = "Plain-text account password")
        @NotBlank String password
) {
}
