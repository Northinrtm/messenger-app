package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ChatSummaryResponse(
        UUID id,
        boolean direct,
        String title,
        String avatarUrl,
        String chatVersion,
        ChatCapabilitiesResponse capabilities,
        UUID ownerUserId,
        List<UUID> moderatorUserIds,
        List<ParticipantResponse> members,
        String lastMessage,
        Instant lastMessageAt,
        Long lastMessageServerOrder,
        Instant updatedAt,
        int unreadCount,
        long membershipVersion,
        MessageSnippetResponse pinnedMessage,
        String prejoinHistoryPolicy
) {
}

