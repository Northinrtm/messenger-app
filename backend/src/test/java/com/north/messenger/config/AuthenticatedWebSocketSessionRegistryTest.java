package com.north.messenger.config;

import com.north.messenger.application.auth.SessionRevokedEvent;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthenticatedWebSocketSessionRegistryTest {

    private AuthenticatedWebSocketSessionRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new AuthenticatedWebSocketSessionRegistry();
    }

    @Test
    void shouldCloseTransportSessionForRevokedAuthSession() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID revokedAuthSessionId = UUID.randomUUID();
        WebSocketSession transportSession = mock(WebSocketSession.class);
        when(transportSession.getId()).thenReturn("ws-1");
        when(transportSession.isOpen()).thenReturn(true);

        registry.register("ws-1", "north", userId, revokedAuthSessionId);
        registry.attachTransportSession(transportSession);

        registry.onSessionRevoked(new SessionRevokedEvent("north", revokedAuthSessionId));

        verify(transportSession).close(argThat(closeStatus ->
                closeStatus.getCode() == CloseStatus.POLICY_VIOLATION.getCode()
                        && "Session revoked".equals(closeStatus.getReason())
        ));
        assertThat(registry.findByWebSocketSessionId("ws-1")).isEmpty();
    }

    @Test
    void shouldNotCloseTransportSessionForDifferentAuthSession() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activeAuthSessionId = UUID.randomUUID();
        UUID otherAuthSessionId = UUID.randomUUID();
        WebSocketSession transportSession = mock(WebSocketSession.class);
        when(transportSession.getId()).thenReturn("ws-1");
        when(transportSession.isOpen()).thenReturn(true);

        registry.register("ws-1", "north", userId, activeAuthSessionId);
        registry.attachTransportSession(transportSession);

        registry.onSessionRevoked(new SessionRevokedEvent("north", otherAuthSessionId));

        verify(transportSession, never()).close(org.mockito.ArgumentMatchers.any(CloseStatus.class));
        assertThat(registry.findByWebSocketSessionId("ws-1")).isPresent();
    }
}
