package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record MessageSnippetResponse(
        UUID id,
        ParticipantResponse sender,
        Instant createdAt,
        String preview
) {
}
