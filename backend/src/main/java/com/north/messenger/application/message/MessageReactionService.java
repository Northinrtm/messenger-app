package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
class MessageReactionService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final MessageSupport messageSupport;

    MessageReactionService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReactionRepository messageReactionRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            MessageSupport messageSupport
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.messageSupport = messageSupport;
    }

    @Transactional
    MessageReactionEventResponse toggleReaction(
            UUID chatId,
            UUID messageId,
            String username,
            ToggleMessageReactionRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }

        String reactionKey = messageSupport.normalizeReactionKey(request.key());
        messageReactionRepository.findByMessageIdAndUserIdAndReactionKey(messageId, currentUser.getId(), reactionKey)
                .ifPresentOrElse(
                        messageReactionRepository::delete,
                        () -> messageReactionRepository.save(new MessageReaction(
                                UUID.randomUUID(),
                                messageId,
                                currentUser.getId(),
                                reactionKey,
                                Instant.now()
                        ))
                );

        MessageReactionEventResponse event = new MessageReactionEventResponse(
                messageId,
                chatId,
                messageSupport.loadReactionSummaries(List.of(messageId), currentUser.getId())
                        .getOrDefault(messageId, List.of())
        );

        chatService.findParticipants(chatId).forEach(participant -> realtimeMessagingGateway.sendToUser(
                participant.getUsername(),
                "/queue/message-reactions",
                messageSupport.buildReactionEvent(messageId, chatId, participant.getId())
        ));
        return event;
    }
}
