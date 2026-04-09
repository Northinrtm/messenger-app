package com.north.messenger.api.dto;

import java.util.UUID;

public record ParticipantResponse(
        UUID id,
        String username,
        String displayName,
        String profession,
        String avatarUrl,
        boolean online
) {
    public ParticipantResponse(
            UUID id,
            String username,
            String displayName,
            String avatarUrl,
            boolean online
    ) {
        this(id, username, displayName, null, avatarUrl, online);
    }
}
