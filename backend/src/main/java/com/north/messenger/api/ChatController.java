package com.north.messenger.api;

import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.GroupParticipantActionRequest;
import com.north.messenger.api.dto.UpdateGroupChatRequest;
import com.north.messenger.api.dto.UpdateArchivedChatRequest;
import com.north.messenger.api.dto.UpdatePinnedMessageRequest;
import com.north.messenger.application.chat.ChatService;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping
    public List<ChatSummaryResponse> listChats(Authentication authentication) {
        return chatService.listChats(authentication.getName());
    }

    @GetMapping("/archive")
    public List<UUID> listArchivedChatIds(Authentication authentication) {
        return chatService.listArchivedChatIds(authentication.getName());
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

    @PutMapping("/{chatId}/pin")
    public ChatSummaryResponse updatePinnedMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestBody UpdatePinnedMessageRequest request
    ) {
        return chatService.updatePinnedMessage(authentication.getName(), chatId, request.messageId());
    }
}
