package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;

public record MobileRefreshTokenRequest(
        @NotBlank(message = "refreshToken is required")
        String refreshToken
) {
}
