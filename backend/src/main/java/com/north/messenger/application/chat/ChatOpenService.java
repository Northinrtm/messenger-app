package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatOpenResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.GroupHistoryKeyAccessResponse;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.domain.model.UserAccount;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChatOpenService {

    private final AuthService authService;
    private final ChatService chatService;
    private final MessageService messageService;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;

    public ChatOpenService(
            AuthService authService,
            ChatService chatService,
            MessageService messageService,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.messageService = messageService;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
    }

    @Transactional
    public ChatOpenResponse openChat(
            String username,
            UUID chatId,
            int limit,
            boolean acknowledgeDelivered
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatSummaryResponse chat = chatService.getChatSummaryForUser(chatId, currentUser);
        MessagePageResponse initialMessagePage = messageService.listMessagePage(
                chatId,
                username,
                (String) null,
                limit,
                acknowledgeDelivered
        );

        GroupHistoryKeyAccessResponse activeHistoryKeyAccess = null;
        try {
            activeHistoryKeyAccess = chatGroupHistoryKeyService.getOwnActiveGroupHistoryKey(username, chatId);
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode() != HttpStatus.NOT_FOUND) {
                throw exception;
            }
        }

        return new ChatOpenResponse(
                chat,
                initialMessagePage.messages(),
                initialMessagePage.nextCursor(),
                initialMessagePage.confirmedPendingOutgoingClientMessageIds(),
                activeHistoryKeyAccess
        );
    }
}
