package com.north.messenger.application.message;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserChatReactionAttention;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserChatReactionAttentionRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class MessageReactionServiceTest {

    private static final Instant NOW = Instant.parse("2026-03-22T12:00:00Z");

    private AuthService authService;
    private ChatService chatService;
    private ChatMessageRepository chatMessageRepository;
    private MessageReactionRepository messageReactionRepository;
    private UserChatReactionAttentionRepository userChatReactionAttentionRepository;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private MessageSupport messageSupport;
    private ApplicationEventPublisher eventPublisher;
    private MessageReactionService service;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        messageReactionRepository = mock(MessageReactionRepository.class);
        userChatReactionAttentionRepository = mock(UserChatReactionAttentionRepository.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        messageSupport = mock(MessageSupport.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        service = new MessageReactionService(
                authService,
                chatService,
                chatMessageRepository,
                messageReactionRepository,
                userChatReactionAttentionRepository,
                realtimeMessagingGateway,
                messageSupport,
                eventPublisher
        );
    }

    @Test
    void removingReactionShouldDropMessageFromAttentionCounter() {
        UUID authorId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID firstMessageId = UUID.randomUUID();
        UUID secondMessageId = UUID.randomUUID();
        UUID thirdMessageId = UUID.randomUUID();
        UserAccount actor = testUserAccount(UUID.randomUUID(), "bob", "Bob", "hash", NOW);
        ChatRoom room = new ChatRoom(chatId, null, true, NOW);
        ChatMessage message = new ChatMessage(firstMessageId, chatId, authorId, "hi", NOW);

        UserChatReactionAttention attention = new UserChatReactionAttention(
                UUID.randomUUID(), authorId, chatId, NOW);
        attention.touch(NOW, firstMessageId);
        attention.touch(NOW, secondMessageId);
        attention.touch(NOW, thirdMessageId);

        when(authService.requireAuthenticatedUser("bob")).thenReturn(actor);
        when(chatService.requireChatMembership(chatId, actor)).thenReturn(room);
        when(chatMessageRepository.findById(firstMessageId)).thenReturn(Optional.of(message));
        when(messageSupport.normalizeReactionKey("LIKE")).thenReturn("LIKE");
        when(messageReactionRepository.findAllByMessageIdAndUserId(firstMessageId, actor.getId()))
                .thenReturn(List.of(new MessageReaction(UUID.randomUUID(), firstMessageId, actor.getId(), "LIKE", NOW)));
        when(messageSupport.loadReactionSummaries(List.of(firstMessageId), actor.getId())).thenReturn(Map.of());
        // After the actor's reaction is deleted, no participant reacts to this message anymore.
        when(messageReactionRepository.findAllByMessageIdIn(List.of(firstMessageId))).thenReturn(List.of());
        when(userChatReactionAttentionRepository.findByUserIdAndChatId(authorId, chatId))
                .thenReturn(Optional.of(attention));

        service.toggleReaction(chatId, firstMessageId, "bob", new ToggleMessageReactionRequest("LIKE"));

        assertThat(attention.getMessageIdList()).containsExactly(secondMessageId, thirdMessageId);
        verify(userChatReactionAttentionRepository, never()).delete(any(UserChatReactionAttention.class));
    }

    @Test
    void removingReactionShouldKeepMessageWhenAnotherParticipantStillReacts() {
        UUID authorId = UUID.randomUUID();
        UUID otherReactorId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UserAccount actor = testUserAccount(UUID.randomUUID(), "bob", "Bob", "hash", NOW);
        ChatRoom room = new ChatRoom(chatId, null, true, NOW);
        ChatMessage message = new ChatMessage(messageId, chatId, authorId, "hi", NOW);

        UserChatReactionAttention attention = new UserChatReactionAttention(
                UUID.randomUUID(), authorId, chatId, NOW);
        attention.touch(NOW, messageId);

        when(authService.requireAuthenticatedUser("bob")).thenReturn(actor);
        when(chatService.requireChatMembership(chatId, actor)).thenReturn(room);
        when(chatMessageRepository.findById(messageId)).thenReturn(Optional.of(message));
        when(messageSupport.normalizeReactionKey("LIKE")).thenReturn("LIKE");
        when(messageReactionRepository.findAllByMessageIdAndUserId(messageId, actor.getId()))
                .thenReturn(List.of(new MessageReaction(UUID.randomUUID(), messageId, actor.getId(), "LIKE", NOW)));
        when(messageSupport.loadReactionSummaries(List.of(messageId), actor.getId())).thenReturn(Map.of());
        // Another participant still has a reaction on the same message.
        when(messageReactionRepository.findAllByMessageIdIn(List.of(messageId)))
                .thenReturn(List.of(new MessageReaction(UUID.randomUUID(), messageId, otherReactorId, "LOVE", NOW)));
        when(userChatReactionAttentionRepository.findByUserIdAndChatId(authorId, chatId))
                .thenReturn(Optional.of(attention));

        service.toggleReaction(chatId, messageId, "bob", new ToggleMessageReactionRequest("LIKE"));

        assertThat(attention.getMessageIdList()).containsExactly(messageId);
    }
}
