package com.north.messenger.api.dto;

public record AuthResponse(
        String token,
        UserProfileResponse user
) {
}

