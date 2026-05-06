package com.north.messenger.application.chat;

import com.north.messenger.api.dto.WorkspaceBootstrapResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.PendingOutgoingMessageService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class WorkspaceBootstrapService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatDraftService chatDraftService;
    private final PendingOutgoingMessageService pendingOutgoingMessageService;
    private final VideoConferenceService videoConferenceService;

    public WorkspaceBootstrapService(
            AuthService authService,
            ChatService chatService,
            ChatDraftService chatDraftService,
            PendingOutgoingMessageService pendingOutgoingMessageService,
            VideoConferenceService videoConferenceService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatDraftService = chatDraftService;
        this.pendingOutgoingMessageService = pendingOutgoingMessageService;
        this.videoConferenceService = videoConferenceService;
    }

    public WorkspaceBootstrapResponse load(String username) {
        var profile = authService.me(username);
        var chats = chatService.listChats(username);
        var archivedChatIds = chatService.listArchivedChatIds(username);
        var contacts = authService.listContacts(username);
        var blockedUsers = authService.listBlockedUsers(username);
        var drafts = chatDraftService.listOwnDrafts(username);
        var pendingOutgoingMessages = pendingOutgoingMessageService.listOwnPendingOutgoingMessages(username);
        var conferences = videoConferenceService.listConferences(username);
        var archivedConferences = videoConferenceService.listArchivedConferences(username);
        return new WorkspaceBootstrapResponse(
                buildWorkspaceVersion(
                        profile,
                        chats,
                        archivedChatIds,
                        contacts,
                        blockedUsers,
                        drafts,
                        pendingOutgoingMessages,
                        conferences,
                        archivedConferences
                ),
                profile,
                chats,
                archivedChatIds,
                contacts,
                blockedUsers,
                drafts,
                pendingOutgoingMessages,
                conferences,
                archivedConferences
        );
    }

    private String buildWorkspaceVersion(
            com.north.messenger.api.dto.UserProfileResponse profile,
            java.util.List<com.north.messenger.api.dto.ChatSummaryResponse> chats,
            java.util.List<java.util.UUID> archivedChatIds,
            java.util.List<com.north.messenger.api.dto.UserProfileResponse> contacts,
            java.util.List<com.north.messenger.api.dto.UserProfileResponse> blockedUsers,
            java.util.List<com.north.messenger.api.dto.ChatDraftResponse> drafts,
            java.util.List<com.north.messenger.api.dto.PendingOutgoingMessageResponse> pendingOutgoingMessages,
            java.util.List<com.north.messenger.api.dto.VideoConferenceResponse> conferences,
            java.util.List<com.north.messenger.api.dto.VideoConferenceResponse> archivedConferences
    ) {
        String chatsVersion = chats.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.ChatSummaryResponse::id))
                .map(chat -> chat.id() + ":" + chat.chatVersion())
                .collect(java.util.stream.Collectors.joining(","));
        String archivedChatsVersion = archivedChatIds.stream()
                .map(java.util.UUID::toString)
                .sorted()
                .collect(java.util.stream.Collectors.joining(","));
        String contactsVersion = contacts.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.UserProfileResponse::id))
                .map(contact -> String.join(
                        ":",
                        contact.id().toString(),
                        contact.username(),
                        contact.displayName(),
                        String.valueOf(contact.avatarUrl()),
                        Boolean.toString(contact.online())
                ))
                .collect(java.util.stream.Collectors.joining(","));
        String blockedUsersVersion = blockedUsers.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.UserProfileResponse::id))
                .map(blocked -> blocked.id().toString())
                .collect(java.util.stream.Collectors.joining(","));
        String draftsVersion = drafts.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.ChatDraftResponse::chatId))
                .map(draft -> draft.chatId() + ":" + draft.updatedAt() + ":" + draft.content())
                .collect(java.util.stream.Collectors.joining(","));
        String pendingOutgoingVersion = pendingOutgoingMessages.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.PendingOutgoingMessageResponse::clientMessageId))
                .map(message -> message.chatId() + ":" + message.clientMessageId() + ":" + message.updatedAt() + ":" + message.status())
                .collect(java.util.stream.Collectors.joining(","));
        String conferencesVersion = conferences.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.VideoConferenceResponse::id))
                .map(conference -> conference.id() + ":" + conference.title() + ":" + conference.scheduledAt() + ":" + conference.endedAt())
                .collect(java.util.stream.Collectors.joining(","));
        String archivedConferencesVersion = archivedConferences.stream()
                .sorted(java.util.Comparator.comparing(com.north.messenger.api.dto.VideoConferenceResponse::id))
                .map(conference -> conference.id() + ":" + conference.title() + ":" + conference.scheduledAt() + ":" + conference.endedAt())
                .collect(java.util.stream.Collectors.joining(","));
        return String.join(
                "|",
                profile.id().toString(),
                profile.displayName(),
                String.valueOf(profile.avatarUrl()),
                Boolean.toString(profile.online()),
                chatsVersion,
                archivedChatsVersion,
                contactsVersion,
                blockedUsersVersion,
                draftsVersion,
                pendingOutgoingVersion,
                conferencesVersion,
                archivedConferencesVersion
        );
    }
}
