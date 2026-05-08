package com.north.messenger.api;

import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ChatDraftResponse;
import com.north.messenger.api.dto.ChatOpenResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.GroupParticipantActionRequest;
import com.north.messenger.api.dto.UpsertChatDraftRequest;
import com.north.messenger.api.dto.UpdateGroupChatRequest;
import com.north.messenger.api.dto.UpdateArchivedChatRequest;
import com.north.messenger.api.dto.UpdatePinnedMessageRequest;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.chat.ChatOpenService;
import com.north.messenger.application.chat.ChatDraftService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.chat.VideoConferenceService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats")
public class ChatController {

    private final ChatService chatService;
    private final ChatDraftService chatDraftService;
    private final ChatOpenService chatOpenService;
    private final VideoConferenceService videoConferenceService;

    public ChatController(
            ChatService chatService,
            ChatDraftService chatDraftService,
            ChatOpenService chatOpenService,
            VideoConferenceService videoConferenceService
    ) {
        this.chatService = chatService;
        this.chatDraftService = chatDraftService;
        this.chatOpenService = chatOpenService;
        this.videoConferenceService = videoConferenceService;
    }

    @GetMapping
    public List<ChatSummaryResponse> listChats(Authentication authentication) {
        return chatService.listChats(authentication.getName());
    }

    @GetMapping("/archive")
    public List<UUID> listArchivedChatIds(Authentication authentication) {
        return chatService.listArchivedChatIds(authentication.getName());
    }

    @GetMapping("/drafts")
    public List<ChatDraftResponse> listDrafts(Authentication authentication) {
        return chatDraftService.listOwnDrafts(authentication.getName());
    }

    @GetMapping("/{chatId}/open")
    public ChatOpenResponse openChat(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(defaultValue = "30") int limit,
            @RequestParam(defaultValue = "false") boolean acknowledgeDelivered
    ) {
        return chatOpenService.openChat(authentication.getName(), chatId, limit, acknowledgeDelivered);
    }

    @PostMapping("/direct")
    public ChatSummaryResponse createDirectChat(
            Authentication authentication,
            @Valid @RequestBody CreateDirectChatRequest request
    ) {
        return chatService.createDirectChat(authentication.getName(), request);
    }

    @PostMapping("/group")
    public ChatSummaryResponse createGroupChat(
            Authentication authentication,
            @Valid @RequestBody CreateGroupChatRequest request
    ) {
        return chatService.createGroupChat(authentication.getName(), request);
    }

    @PostMapping("/{chatId}/conference-call")
    @Operation(summary = "Start or join the active conference call for a group chat")
    public VideoConferenceResponse startGroupConferenceCall(
            Authentication authentication,
            @PathVariable UUID chatId
    ) {
        return videoConferenceService.startGroupConferenceCall(authentication.getName(), chatId);
    }

    @PostMapping("/{chatId}/participants")
    public ChatSummaryResponse addGroupParticipants(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody AddGroupParticipantsRequest request
    ) {
        return chatService.addGroupParticipants(authentication.getName(), chatId, request);
    }

    @PutMapping("/{chatId}")
    public ChatSummaryResponse updateGroupChat(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpdateGroupChatRequest request
    ) {
        return chatService.updateGroupChat(authentication.getName(), chatId, request);
    }

    @PostMapping("/{chatId}/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leaveGroup(Authentication authentication, @PathVariable UUID chatId) {
        chatService.leaveGroup(authentication.getName(), chatId);
    }

    @DeleteMapping("/{chatId}/group")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGroup(Authentication authentication, @PathVariable UUID chatId) {
        chatService.deleteGroup(authentication.getName(), chatId);
    }

    @PostMapping("/{chatId}/bans")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void banGroupParticipant(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody GroupParticipantActionRequest request
    ) {
        chatService.banGroupParticipant(authentication.getName(), chatId, request.username());
    }

    @PostMapping("/{chatId}/moderators")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assignGroupModerator(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody GroupParticipantActionRequest request
    ) {
        chatService.assignGroupModerator(authentication.getName(), chatId, request.username());
    }

    @DeleteMapping("/{chatId}/moderators/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeGroupModerator(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable String username
    ) {
        chatService.revokeGroupModerator(authentication.getName(), chatId, username);
    }

    @DeleteMapping("/{chatId}/participants/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeGroupParticipant(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable String username
    ) {
        chatService.removeGroupParticipant(authentication.getName(), chatId, username);
    }

    @PutMapping("/{chatId}/archive")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateArchivedChatState(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpdateArchivedChatRequest request
    ) {
        chatService.updateArchivedChatState(authentication.getName(), chatId, request.archived());
    }

    @DeleteMapping("/{chatId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteChatForSelf(Authentication authentication, @PathVariable UUID chatId) {
        chatService.deleteChatForSelf(authentication.getName(), chatId);
    }

    @PutMapping("/{chatId}/draft")
    public ChatDraftResponse upsertDraft(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpsertChatDraftRequest request
    ) {
        return chatDraftService.upsertOwnDraft(authentication.getName(), chatId, request.content());
    }

    @DeleteMapping("/{chatId}/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDraft(Authentication authentication, @PathVariable UUID chatId) {
        chatDraftService.deleteOwnDraft(authentication.getName(), chatId);
    }

    @PutMapping("/{chatId}/pin")
    public ChatSummaryResponse updatePinnedMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestBody UpdatePinnedMessageRequest request
    ) {
        return chatService.updatePinnedMessage(authentication.getName(), chatId, request.messageId());
    }
}
