package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageDeletionEventResponse;
import com.north.messenger.application.chat.ChatService;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MessageRealtimeEventListener {

    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final ChatService chatService;
    private final MessageReceiptService messageReceiptService;
    private final MessageReactionService messageReactionService;

    public MessageRealtimeEventListener(
            RealtimeMessagingGateway realtimeMessagingGateway,
            ChatService chatService,
            MessageReceiptService messageReceiptService,
            MessageReactionService messageReactionService
    ) {
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.chatService = chatService;
        this.messageReceiptService = messageReceiptService;
        this.messageReactionService = messageReactionService;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageDeletion(MessageDeletionBroadcastEvent event) {
        event.usernames().forEach(username -> realtimeMessagingGateway.sendToUser(
                username,
                "/queue/message-deletions",
                new MessageDeletionEventResponse(event.messageId(), event.chatId())
        ));
        chatService.notifyChatUpdated(event.chatId());
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageStatusChanged(MessageStatusChangedEvent event) {
        messageReceiptService.notifyMessageStatusChanged(event.messageIds());
        if (event.refreshChatSummary()) {
            chatService.notifyChatUpdated(event.chatId());
        }
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageReactionChanged(MessageReactionChangedEvent event) {
        messageReactionService.broadcastReactionChanged(event.chatId(), event.messageId(), event.actorUserId());
        chatService.notifyChatUpdated(event.chatId());
    }
}
