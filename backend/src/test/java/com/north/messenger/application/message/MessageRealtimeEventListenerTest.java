package com.north.messenger.application.message;

import com.north.messenger.application.chat.ChatService;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MessageRealtimeEventListenerTest {

    @Test
    void reactionChangesShouldRefreshChatSummaryAfterBroadcast() {
        RealtimeMessagingGateway realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        ChatService chatService = mock(ChatService.class);
        MessageReceiptService messageReceiptService = mock(MessageReceiptService.class);
        MessageReactionService messageReactionService = mock(MessageReactionService.class);
        MessageRealtimeEventListener listener = new MessageRealtimeEventListener(
                realtimeMessagingGateway,
                chatService,
                messageReceiptService,
                messageReactionService
        );
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();

        listener.onMessageReactionChanged(new MessageReactionChangedEvent(chatId, messageId));

        verify(messageReactionService).broadcastReactionChanged(chatId, messageId);
        verify(chatService).notifyChatUpdated(chatId);
    }
}
