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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketOutboundSecurityInterceptorTest {

    private AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;
    private AuthService authService;
    private ChatParticipantRepository chatParticipantRepository;
    private WebSocketOutboundSecurityInterceptor interceptor;

    @BeforeEach
    void setUp() {
        webSocketSessionRegistry = new AuthenticatedWebSocketSessionRegistry();
        authService = mock(AuthService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        interceptor = new WebSocketOutboundSecurityInterceptor(
                webSocketSessionRegistry,
                authService,
                chatParticipantRepository
        );
    }

    @Test
    void shouldAllowTypingTopicForActiveChatMember() {
        UUID authSessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UserAccount user = new UserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        webSocketSessionRegistry.register("ws-1", "north", authSessionId);
        when(authService.isSessionActive("north", authSessionId)).thenReturn(true);
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(true);

        Message<byte[]> message = outboundTypingMessage("ws-1", chatId);

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isSameAs(message);
    }

    @Test
    void shouldDropTypingTopicForInactiveSession() {
        UUID authSessionId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        webSocketSessionRegistry.register("ws-1", "north", authSessionId);
        when(authService.isSessionActive("north", authSessionId)).thenReturn(false);

        Message<byte[]> message = outboundTypingMessage("ws-1", chatId);

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isNull();
        assertThat(webSocketSessionRegistry.findByWebSocketSessionId("ws-1")).isEmpty();
    }

    @Test
    void shouldDropTypingTopicForNonMember() {
        UUID authSessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UserAccount user = new UserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        webSocketSessionRegistry.register("ws-1", "north", authSessionId);
        when(authService.isSessionActive("north", authSessionId)).thenReturn(true);
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(false);

        Message<byte[]> message = outboundTypingMessage("ws-1", chatId);

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isNull();
    }

    @Test
    void shouldIgnoreUnrelatedOutboundMessage() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.MESSAGE);
        accessor.setSessionId("ws-1");
        accessor.setDestination("/queue/messages-user123");
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isSameAs(message);
    }

    private Message<byte[]> outboundTypingMessage(String webSocketSessionId, UUID chatId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.MESSAGE);
        accessor.setSessionId(webSocketSessionId);
        accessor.setDestination("/topic/chats." + chatId + ".typing");
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
