package com.north.messenger.api.dto;

import java.util.List;

public record WorkspaceSearchResponse(
        List<UserProfileResponse> users,
        List<UserProfileResponse> contacts,
        List<ChatSummaryResponse> chats,
        List<VideoConferenceResponse> conferences
) {
}
