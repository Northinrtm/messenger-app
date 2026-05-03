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
        return new WorkspaceBootstrapResponse(
                authService.me(username),
                chatService.listChats(username),
                chatService.listArchivedChatIds(username),
                authService.listContacts(username),
                authService.listBlockedUsers(username),
                chatDraftService.listOwnDrafts(username),
                pendingOutgoingMessageService.listOwnPendingOutgoingMessages(username),
                videoConferenceService.listConferences(username),
                videoConferenceService.listArchivedConferences(username)
        );
    }
}
