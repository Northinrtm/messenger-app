package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record ChatDraftResponse(
        UUID chatId,
        String content,
        Instant updatedAt
) {
}
