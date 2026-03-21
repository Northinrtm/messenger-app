package com.north.messenger.api.dto;

import java.util.UUID;

public record ParticipantResponse(
        UUID id,
        String username,
        String displayName
) {
}

