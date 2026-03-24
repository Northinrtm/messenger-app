package com.north.messenger.config;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketAuthChannelInterceptorTest {

    private AuthService authService;
    private ChatParticipantRepository chatParticipantRepository;
    private WebSocketAuthChannelInterceptor interceptor;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        interceptor = new WebSocketAuthChannelInterceptor(authService, chatParticipantRepository);
    }

    @Test
    void shouldAuthorizeTypingTopicSubscriptionForChatMember() {
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UserAccount user = new UserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(true);

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination("/topic/chats." + chatId + ".typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isSameAs(message);
    }
}
