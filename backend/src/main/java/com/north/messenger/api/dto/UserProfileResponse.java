package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String username,
        String displayName,
        String profession,
        Instant createdAt,
        String avatarUrl,
        boolean online,
        String email,
        boolean emailVerified,
        boolean emailVerificationEnabled,
        long passwordVersion
) {
    public UserProfileResponse(
            UUID id,
            String username,
            String displayName,
            String profession,
            Instant createdAt,
            String avatarUrl,
            boolean online
    ) {
        this(id, username, displayName, profession, createdAt, avatarUrl, online, null, false, false, 1L);
    }

    public UserProfileResponse(
            UUID id,
            String username,
            String displayName,
            Instant createdAt,
            String avatarUrl,
            boolean online
    ) {
        this(id, username, displayName, null, createdAt, avatarUrl, online, null, false, false, 1L);
    }
}
