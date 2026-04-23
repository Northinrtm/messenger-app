package com.north.messenger.application.chat;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ChatRealtimeEventListener {

    private final ChatService chatService;

    public ChatRealtimeEventListener(ChatService chatService) {
        this.chatService = chatService;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onChatUpdated(ChatUpdatedDeferredEvent event) {
        chatService.notifyChatUpdated(event.chatId());
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onChatRemoval(ChatRemovalDeferredEvent event) {
        chatService.broadcastChatRemoval(event.chatId(), event.usernames());
    }
}
