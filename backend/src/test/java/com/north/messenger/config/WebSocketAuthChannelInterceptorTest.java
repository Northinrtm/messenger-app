package com.north.messenger.config;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import java.time.Instant;
import java.util.HashMap;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketAuthChannelInterceptorTest {

    private AuthService authService;
    private ChatParticipantRepository chatParticipantRepository;
    private AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;
    private WebSocketAuthChannelInterceptor interceptor;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        webSocketSessionRegistry = mock(AuthenticatedWebSocketSessionRegistry.class);
        interceptor = new WebSocketAuthChannelInterceptor(authService, chatParticipantRepository, webSocketSessionRegistry);
    }

    @Test
    void shouldAuthorizeTypingTopicSubscriptionForChatMember() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UserAccount user = testUserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(authService.authenticateSession("north", sessionId))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(true);

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination("/topic/chats." + chatId + ".typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        accessor.setSessionAttributes(new HashMap<>());
        accessor.getSessionAttributes().put(WebSocketAuthChannelInterceptor.SESSION_ID_ATTRIBUTE, sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isSameAs(message);
    }

    @Test
    void shouldDropTypingTopicSubscriptionForNonMemberWithoutThrowing() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UserAccount user = testUserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(authService.authenticateSession("north", sessionId))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(false);

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination("/topic/chats." + chatId + ".typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        accessor.setSessionAttributes(new HashMap<>());
        accessor.getSessionAttributes().put(WebSocketAuthChannelInterceptor.SESSION_ID_ATTRIBUTE, sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isNull();
    }

    @Test
    void shouldRestorePrincipalFromConnectSessionForUserQueueSubscription() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UserAccount user = testUserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.authenticateAccessToken("access-token"))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));
        when(authService.authenticateSession("north", sessionId))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));

        StompHeaderAccessor connectAccessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        connectAccessor.setSessionId("session-1");
        connectAccessor.setSessionAttributes(new HashMap<>());
        connectAccessor.setNativeHeader(HttpHeaders.AUTHORIZATION, "Bearer access-token");
        Message<byte[]> connectMessage = MessageBuilder.createMessage(new byte[0], connectAccessor.getMessageHeaders());

        Message<?> connectResult = interceptor.preSend(connectMessage, mock(MessageChannel.class));

        assertThat(connectResult).isNotNull();
        verify(webSocketSessionRegistry).register("session-1", "north", sessionId);

        StompHeaderAccessor subscribeAccessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        subscribeAccessor.setSessionId("session-1");
        subscribeAccessor.setSessionAttributes(connectAccessor.getSessionAttributes());
        subscribeAccessor.setDestination("/user/queue/chats");
        Message<byte[]> subscribeMessage = MessageBuilder.createMessage(new byte[0], subscribeAccessor.getMessageHeaders());

        Message<?> subscribeResult = interceptor.preSend(subscribeMessage, mock(MessageChannel.class));

        assertThat(subscribeResult).isNotNull();
        assertThat(StompHeaderAccessor.wrap(subscribeResult).getUser()).isNotNull();
        assertThat(StompHeaderAccessor.wrap(subscribeResult).getUser().getName()).isEqualTo("north");
    }

    @Test
    void shouldDropSendToBrokerDestination() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UserAccount user = testUserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.authenticateSession("north", sessionId))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination("/topic/chats." + UUID.randomUUID() + ".typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        accessor.setSessionAttributes(new HashMap<>());
        accessor.getSessionAttributes().put(WebSocketAuthChannelInterceptor.SESSION_ID_ATTRIBUTE, sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isNull();
    }

    @Test
    void shouldAllowSendToApplicationDestinationForActiveSession() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UserAccount user = testUserAccount(
                userId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.authenticateSession("north", sessionId))
                .thenReturn(Optional.of(new AuthService.AuthenticatedSession(user, sessionId)));

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination("/app/chats/" + UUID.randomUUID() + "/typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        accessor.setSessionAttributes(new HashMap<>());
        accessor.getSessionAttributes().put(WebSocketAuthChannelInterceptor.SESSION_ID_ATTRIBUTE, sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isSameAs(message);
    }

    @Test
    void shouldDropFramesForRevokedSession() {
        UUID sessionId = UUID.randomUUID();

        when(authService.authenticateSession("north", sessionId)).thenReturn(Optional.empty());

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination("/app/chats/" + UUID.randomUUID() + "/typing");
        accessor.setUser(new UsernamePasswordAuthenticationToken("north", null));
        accessor.setSessionAttributes(new HashMap<>());
        accessor.getSessionAttributes().put(WebSocketAuthChannelInterceptor.SESSION_ID_ATTRIBUTE, sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(message, mock(MessageChannel.class));

        assertThat(result).isNull();
    }
}
