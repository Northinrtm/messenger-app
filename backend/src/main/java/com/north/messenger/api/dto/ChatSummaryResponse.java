package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ChatSummaryResponse(
        UUID id,
        boolean direct,
        String title,
        List<ParticipantResponse> members,
        String lastMessage,
        Instant lastMessageAt,
        Instant updatedAt,
        int unreadCount,
        MessageSnippetResponse pinnedMessage
) {
}

