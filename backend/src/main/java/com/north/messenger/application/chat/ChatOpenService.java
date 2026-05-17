package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatOpenResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.domain.model.UserAccount;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChatOpenService {

    private final AuthService authService;
    private final ChatService chatService;
    private final MessageService messageService;

    public ChatOpenService(
            AuthService authService,
            ChatService chatService,
            MessageService messageService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.messageService = messageService;
    }

    @Transactional
    public ChatOpenResponse openChat(
            String username,
            UUID chatId,
            int limit,
            boolean acknowledgeDelivered
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.clearReactionAttention(chatId, currentUser.getId());
        ChatSummaryResponse chat = chatService.getChatSummaryForUser(chatId, currentUser);
        MessagePageResponse initialMessagePage = messageService.listMessagePage(
                chatId,
                username,
                (String) null,
                limit,
                acknowledgeDelivered
        );

        return new ChatOpenResponse(
                chat,
                initialMessagePage.messages(),
                initialMessagePage.nextCursor(),
                initialMessagePage.confirmedPendingOutgoingClientMessageIds()
        );
    }
}
