package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record TypingEventResponse(
        UUID chatId,
        ParticipantResponse participant,
        boolean typing,
        Instant createdAt
) {
}
