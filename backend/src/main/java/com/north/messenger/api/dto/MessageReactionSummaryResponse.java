package com.north.messenger.api.dto;

public record MessageReactionSummaryResponse(
        String key,
        int count,
        boolean reactedByCurrentUser
) {
}
