package com.north.messenger.api.dto;

public record InviteAcceptanceResponse(
        String targetType,
        ChatSummaryResponse chat,
        VideoConferenceResponse conference
) {
}
