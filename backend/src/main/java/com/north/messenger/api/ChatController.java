package com.north.messenger.api;

import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ChatDraftResponse;
import com.north.messenger.api.dto.ChatOpenResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.GroupParticipantActionRequest;
import com.north.messenger.api.dto.ParticipantResponse;
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
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Chats", description = "Chat list, group management, drafts, archive state, invite-related moderation, and chat bootstrap endpoints")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
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
    @Operation(summary = "List chats", description = "Returns the authenticated user's visible chat summaries.")
    public List<ChatSummaryResponse> listChats(Authentication authentication) {
        return chatService.listChats(authentication.getName());
    }

    @GetMapping("/archive")
    @Operation(summary = "List archived chat ids", description = "Returns the set of chat ids currently archived for the authenticated user.")
    public List<UUID> listArchivedChatIds(Authentication authentication) {
        return chatService.listArchivedChatIds(authentication.getName());
    }

    @GetMapping("/drafts")
    @Operation(summary = "List drafts", description = "Returns the authenticated user's saved per-chat drafts.")
    public List<ChatDraftResponse> listDrafts(Authentication authentication) {
        return chatDraftService.listOwnDrafts(authentication.getName());
    }

    @GetMapping("/{chatId}/open")
    @Operation(
            summary = "Open a chat",
            description = "Returns the selected chat summary plus the first page of recent messages and any confirmed pending-outgoing cleanup ids."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatOpenResponse openChat(
            Authentication authentication,
            @Parameter(description = "Chat identifier to open")
            @PathVariable UUID chatId,
            @Parameter(description = "Maximum number of recent messages to include in the initial chat-open payload")
            @RequestParam(defaultValue = "30") int limit,
            @Parameter(description = "When true, also marks delivered receipts while opening the chat")
            @RequestParam(defaultValue = "false") boolean acknowledgeDelivered
    ) {
        return chatOpenService.openChat(authentication.getName(), chatId, limit, acknowledgeDelivered);
    }

    @DeleteMapping("/{chatId}/reaction-attention")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Clear reaction attention", description = "Marks chat-level unread reaction attention as seen for the authenticated user.")
    public void clearReactionAttention(Authentication authentication, @PathVariable UUID chatId) {
        chatService.clearReactionAttention(authentication.getName(), chatId);
    }

    @PostMapping("/direct")
    @Operation(summary = "Create or reopen a direct chat", description = "Starts a direct chat with another user or returns the existing direct chat summary.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatSummaryResponse createDirectChat(
            Authentication authentication,
            @Valid @RequestBody CreateDirectChatRequest request
    ) {
        return chatService.createDirectChat(authentication.getName(), request);
    }

    @PostMapping("/group")
    @Operation(summary = "Create a group chat", description = "Creates a new group chat and adds the requested initial participants.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public ChatSummaryResponse createGroupChat(
            Authentication authentication,
            @Valid @RequestBody CreateGroupChatRequest request
    ) {
        return chatService.createGroupChat(authentication.getName(), request);
    }

    @PostMapping("/{chatId}/conference-call")
    @Operation(
            summary = "Start or join the active group conference call",
            description = "Creates the active conference call for a group chat when needed, or returns the existing active conference."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse startGroupConferenceCall(
            Authentication authentication,
            @Parameter(description = "Group chat that owns the conference call")
            @PathVariable UUID chatId
    ) {
        return videoConferenceService.startGroupConferenceCall(authentication.getName(), chatId);
    }

    @PostMapping("/{chatId}/participants")
    @Operation(summary = "Add group participants", description = "Adds one or more participants to an existing group chat.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatSummaryResponse addGroupParticipants(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody AddGroupParticipantsRequest request
    ) {
        return chatService.addGroupParticipants(authentication.getName(), chatId, request);
    }

    @PutMapping("/{chatId}")
    @Operation(summary = "Update group chat", description = "Updates mutable group settings such as title, avatar, and history visibility policy.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatSummaryResponse updateGroupChat(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpdateGroupChatRequest request
    ) {
        return chatService.updateGroupChat(authentication.getName(), chatId, request);
    }

    @PostMapping("/{chatId}/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Leave a group", description = "Moves the authenticated user out of the active membership roster while preserving read-only history when applicable.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void leaveGroup(Authentication authentication, @PathVariable UUID chatId) {
        chatService.leaveGroup(authentication.getName(), chatId);
    }

    @DeleteMapping("/{chatId}/group")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a group", description = "Deletes the group chat for all participants when the caller has permission to do so.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void deleteGroup(Authentication authentication, @PathVariable UUID chatId) {
        chatService.deleteGroup(authentication.getName(), chatId);
    }

    @PostMapping("/{chatId}/bans")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Ban a group participant", description = "Moves one participant into the group's banned roster without deleting message history.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void banGroupParticipant(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody GroupParticipantActionRequest request
    ) {
        chatService.banGroupParticipant(authentication.getName(), chatId, request.username());
    }

    @GetMapping("/{chatId}/bans")
    @Operation(summary = "List group bans", description = "Returns the users currently banned from the selected group chat.")
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public List<ParticipantResponse> listGroupBans(
            Authentication authentication,
            @PathVariable UUID chatId
    ) {
        return chatService.listGroupBans(authentication.getName(), chatId);
    }

    @DeleteMapping("/{chatId}/bans/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Unban a group participant", description = "Removes one username from the group's banned roster and restores membership eligibility.")
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void unbanGroupParticipant(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable String username
    ) {
        chatService.unbanGroupParticipant(authentication.getName(), chatId, username);
    }

    @PostMapping("/{chatId}/moderators")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Assign a group moderator", description = "Promotes one active group member to moderator.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void assignGroupModerator(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody GroupParticipantActionRequest request
    ) {
        chatService.assignGroupModerator(authentication.getName(), chatId, request.username());
    }

    @PutMapping("/{chatId}/owner")
    @Operation(summary = "Transfer group ownership", description = "Transfers ownership to an active moderator and demotes the previous owner to moderator.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatSummaryResponse transferGroupOwnership(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody GroupParticipantActionRequest request
    ) {
        return chatService.transferGroupOwnership(authentication.getName(), chatId, request.username());
    }

    @DeleteMapping("/{chatId}/moderators/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke moderator rights", description = "Removes moderator access from one group member.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void revokeGroupModerator(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable String username
    ) {
        chatService.revokeGroupModerator(authentication.getName(), chatId, username);
    }

    @DeleteMapping("/{chatId}/participants/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a group participant", description = "Removes one user from the active group membership roster while preserving past message history.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void removeGroupParticipant(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable String username
    ) {
        chatService.removeGroupParticipant(authentication.getName(), chatId, username);
    }

    @PutMapping("/{chatId}/archive")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Update chat archive state", description = "Archives or restores one chat for the authenticated user without affecting other participants.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void updateArchivedChatState(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpdateArchivedChatRequest request
    ) {
        chatService.updateArchivedChatState(authentication.getName(), chatId, request.archived());
    }

    @DeleteMapping("/{chatId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a chat for self", description = "Removes a chat from the authenticated user's personal workspace view only.")
    @ApiResponses({
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void deleteChatForSelf(Authentication authentication, @PathVariable UUID chatId) {
        chatService.deleteChatForSelf(authentication.getName(), chatId);
    }

    @PutMapping("/{chatId}/draft")
    @Operation(summary = "Create or update a draft", description = "Upserts the authenticated user's saved draft text for one chat.")
    @ApiResponses({
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatDraftResponse upsertDraft(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpsertChatDraftRequest request
    ) {
        return chatDraftService.upsertOwnDraft(authentication.getName(), chatId, request.content());
    }

    @DeleteMapping("/{chatId}/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a draft", description = "Deletes the authenticated user's saved draft for one chat. The operation is idempotent.")
    public void deleteDraft(Authentication authentication, @PathVariable UUID chatId) {
        chatDraftService.deleteOwnDraft(authentication.getName(), chatId);
    }

    @PutMapping("/{chatId}/pin")
    @Operation(summary = "Update pinned message", description = "Pins one message in the chat or clears the current pin when messageId is null.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatSummaryResponse updatePinnedMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestBody UpdatePinnedMessageRequest request
    ) {
        return chatService.updatePinnedMessage(authentication.getName(), chatId, request.messageId());
    }
}
