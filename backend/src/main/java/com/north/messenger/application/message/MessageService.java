package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.api.dto.UpdateMessageRequest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class MessageService {
    private final MessageQueryService messageQueryService;
    private final MessageCommandService messageCommandService;
    private final MessageReactionService messageReactionService;
    private final MessageReceiptService messageReceiptService;

    public MessageService(
            MessageQueryService messageQueryService,
            MessageCommandService messageCommandService,
            MessageReactionService messageReactionService,
            MessageReceiptService messageReceiptService
    ) {
        this.messageQueryService = messageQueryService;
        this.messageCommandService = messageCommandService;
        this.messageReactionService = messageReactionService;
        this.messageReceiptService = messageReceiptService;
    }

    @Transactional
    public List<MessageResponse> listMessages(
            UUID chatId,
            String username,
            Instant before,
            UUID beforeMessageId,
            int limit,
            boolean acknowledgeDelivered
    ) {
        return messageQueryService.listMessages(
                chatId,
                username,
                before,
                beforeMessageId,
                limit,
                acknowledgeDelivered
        );
    }

    @Transactional
    public MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        return messageCommandService.sendMessage(chatId, username, request);
    }

    @Transactional
    public void deleteMessage(UUID chatId, UUID messageId, String username, String rawScope) {
        messageCommandService.deleteMessage(chatId, messageId, username, rawScope);
    }

    @Transactional
    public MessageResponse updateMessage(UUID chatId, UUID messageId, String username, UpdateMessageRequest request) {
        return messageCommandService.updateMessage(chatId, messageId, username, request);
    }

    @Transactional
    public MessageReactionEventResponse toggleReaction(
            UUID chatId,
            UUID messageId,
            String username,
            ToggleMessageReactionRequest request
    ) {
        return messageReactionService.toggleReaction(chatId, messageId, username, request);
    }

    @Transactional
    public void acknowledgeDelivered(UUID chatId, String username, MessageReceiptRequest request) {
        messageReceiptService.acknowledgeDelivered(chatId, username, request);
    }

    @Transactional
    public void acknowledgeRead(UUID chatId, String username, MessageReceiptRequest request) {
        messageReceiptService.acknowledgeRead(chatId, username, request);
    }
}
