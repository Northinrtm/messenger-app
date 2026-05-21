package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserChatReactionAttention;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserChatReactionAttentionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
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
    private final UserChatReactionAttentionRepository userChatReactionAttentionRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final MessageSupport messageSupport;
    private final ApplicationEventPublisher eventPublisher;

    MessageReactionService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReactionRepository messageReactionRepository,
            UserChatReactionAttentionRepository userChatReactionAttentionRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            MessageSupport messageSupport,
            ApplicationEventPublisher eventPublisher
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userChatReactionAttentionRepository = userChatReactionAttentionRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.messageSupport = messageSupport;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    MessageReactionEventResponse toggleReaction(
            UUID chatId,
            UUID messageId,
            String username,
            ToggleMessageReactionRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        var room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }

        if (message.getSenderId() != null && message.getSenderId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot react to your own message");
        }

        String reactionKey = messageSupport.normalizeReactionKey(request.key());
        List<MessageReaction> existingReactions = messageReactionRepository
                .findAllByMessageIdAndUserId(messageId, currentUser.getId());
        boolean alreadyHasThisKey = existingReactions.stream()
                .anyMatch(r -> r.getReactionKey().equals(reactionKey));
        messageReactionRepository.deleteAll(existingReactions);
        if (!alreadyHasThisKey) {
            messageReactionRepository.save(new MessageReaction(
                    UUID.randomUUID(),
                    messageId,
                    currentUser.getId(),
                    reactionKey,
                    Instant.now()
            ));
        }

        MessageReactionEventResponse event = new MessageReactionEventResponse(
                messageId,
                chatId,
                messageSupport.loadReactionSummaries(List.of(messageId), currentUser.getId())
                        .getOrDefault(messageId, List.of())
        );
        markReactionAttention(chatId, message, currentUser.getId());

        eventPublisher.publishEvent(new MessageReactionChangedEvent(chatId, messageId, currentUser.getId()));
        return event;
    }

    private void markReactionAttention(UUID chatId, ChatMessage message, UUID actorUserId) {
        UUID attentionUserId = message.getSenderId();
        if (attentionUserId == null || attentionUserId.equals(actorUserId)) {
            return;
        }

        UserChatReactionAttention existingAttention = userChatReactionAttentionRepository
                .findByUserIdAndChatId(attentionUserId, chatId)
                .orElse(null);
        if (existingAttention == null) {
            userChatReactionAttentionRepository.save(new UserChatReactionAttention(
                    UUID.randomUUID(),
                    attentionUserId,
                    chatId,
                    Instant.now()
            ));
            return;
        }

        existingAttention.touch(Instant.now());
    }

    void broadcastReactionChanged(UUID chatId, UUID messageId, UUID actorUserId) {
        chatService.findParticipants(chatId).stream()
                .filter(participant -> !participant.getId().equals(actorUserId))
                .forEach(participant -> realtimeMessagingGateway.sendToUser(
                        participant.getUsername(),
                        "/queue/message-reactions",
                        messageSupport.buildReactionEvent(messageId, chatId, participant.getId())
                ));
    }
}
