package com.north.messenger.api.dto;

import java.util.List;
import java.util.UUID;

public record WorkspaceBootstrapResponse(
        UserProfileResponse profile,
        List<ChatSummaryResponse> chats,
        List<UUID> archivedChatIds,
        List<UserProfileResponse> contacts,
        List<UserProfileResponse> blockedUsers,
        List<ChatDraftResponse> drafts,
        List<PendingOutgoingMessageResponse> pendingOutgoingMessages,
        List<VideoConferenceResponse> conferences,
        List<VideoConferenceResponse> archivedConferences
) {
}
