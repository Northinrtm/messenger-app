package com.north.messenger.application.message;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.auth.SessionRevokedEvent;
import com.north.messenger.config.AuthenticatedWebSocketSessionRegistry;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthenticatedWebSocketUserDeliveryTest {

    private SimpMessagingTemplate messagingTemplate;
    private AuthService authService;
    private AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;
    private AuthenticatedWebSocketUserDelivery delivery;

    @BeforeEach
    void setUp() {
        messagingTemplate = mock(SimpMessagingTemplate.class);
        authService = mock(AuthService.class);
        webSocketSessionRegistry = new AuthenticatedWebSocketSessionRegistry();
        delivery = new AuthenticatedWebSocketUserDelivery(messagingTemplate, webSocketSessionRegistry, authService);
    }

    @Test
    void shouldDeliverOnlyToAuthorizedWebSocketSessions() {
        UUID userId = UUID.randomUUID();
        UUID activeAuthSessionId = UUID.randomUUID();
        UUID revokedAuthSessionId = UUID.randomUUID();
        Map<String, String> payload = Map.of("type", "message");
        webSocketSessionRegistry.register("ws-active", "north", userId, activeAuthSessionId);
        webSocketSessionRegistry.register("ws-revoked", "north", userId, revokedAuthSessionId);

        when(authService.findAuthorizedSessionIds(userId, java.util.Set.of(activeAuthSessionId, revokedAuthSessionId)))
                .thenReturn(java.util.Set.of(activeAuthSessionId));

        delivery.sendToUser("north", "/queue/messages", payload);

        verify(messagingTemplate).convertAndSendToUser(
                eq("ws-active"),
                eq("/queue/messages"),
                eq(payload),
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(headers -> hasSessionId(headers, "ws-active"))
        );
        verify(messagingTemplate, never()).convertAndSendToUser(
                eq("ws-revoked"),
                eq("/queue/messages"),
                eq(payload),
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(headers -> hasSessionId(headers, "ws-revoked"))
        );
    }

    @Test
    void shouldDropUnauthorizedWebSocketSessionForSessionEventsToo() {
        UUID userId = UUID.randomUUID();
        UUID revokedAuthSessionId = UUID.randomUUID();
        Map<String, String> payload = Map.of("type", "SESSION_REVOKED");
        webSocketSessionRegistry.register("ws-revoked", "north", userId, revokedAuthSessionId);
        when(authService.findAuthorizedSessionIds(userId, java.util.Set.of(revokedAuthSessionId)))
                .thenReturn(java.util.Set.of());

        delivery.sendToUser("north", "/queue/sessions", payload);

        verify(messagingTemplate, never()).convertAndSendToUser(
                eq("ws-revoked"),
                eq("/queue/sessions"),
                eq(payload),
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(headers -> hasSessionId(headers, "ws-revoked"))
        );
        org.assertj.core.api.Assertions.assertThat(webSocketSessionRegistry.findByWebSocketSessionId("ws-revoked")).isEmpty();
    }

    @Test
    void shouldCloseLiveRevokedSessionAndStopSubsequentDelivery() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activeAuthSessionId = UUID.randomUUID();
        Map<String, String> payload = Map.of("type", "message");
        WebSocketSession transportSession = mock(WebSocketSession.class);
        when(transportSession.getId()).thenReturn("ws-live");
        when(transportSession.isOpen()).thenReturn(true);
        webSocketSessionRegistry.register("ws-live", "north", userId, activeAuthSessionId);
        webSocketSessionRegistry.attachTransportSession(transportSession);
        when(authService.findAuthorizedSessionIds(userId, java.util.Set.of(activeAuthSessionId)))
                .thenReturn(java.util.Set.of(activeAuthSessionId));

        delivery.sendToUser("north", "/queue/messages", payload);

        verify(messagingTemplate, times(1)).convertAndSendToUser(
                eq("ws-live"),
                eq("/queue/messages"),
                eq(payload),
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(headers -> hasSessionId(headers, "ws-live"))
        );

        webSocketSessionRegistry.onSessionRevoked(new SessionRevokedEvent("north", activeAuthSessionId));

        verify(transportSession).close(argThat(closeStatus ->
                closeStatus.getCode() == CloseStatus.POLICY_VIOLATION.getCode()
                        && "Session revoked".equals(closeStatus.getReason())
        ));
        assertThat(webSocketSessionRegistry.findByWebSocketSessionId("ws-live")).isEmpty();

        delivery.sendToUser("north", "/queue/messages", payload);

        verify(messagingTemplate, times(1)).convertAndSendToUser(
                eq("ws-live"),
                eq("/queue/messages"),
                eq(payload),
                org.mockito.ArgumentMatchers.<Map<String, Object>>any()
        );
    }

    private boolean hasSessionId(Map<String, Object> headers, String expectedSessionId) {
        return expectedSessionId.equals(SimpMessageHeaderAccessor.getSessionId(headers));
    }
}
