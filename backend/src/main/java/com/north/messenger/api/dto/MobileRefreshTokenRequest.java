package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "Refresh token payload for the mobile client")
public record MobileRefreshTokenRequest(
        @Schema(description = "Refresh token previously issued to the mobile client")
        @NotBlank(message = "refreshToken is required")
        String refreshToken
) {
}
