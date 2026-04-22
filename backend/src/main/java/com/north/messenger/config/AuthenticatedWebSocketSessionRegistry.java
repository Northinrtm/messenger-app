package com.north.messenger.config;

import com.north.messenger.application.auth.SessionRevokedEvent;
import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class AuthenticatedWebSocketSessionRegistry {

    private static final Logger log = LoggerFactory.getLogger(AuthenticatedWebSocketSessionRegistry.class);
    private static final CloseStatus SESSION_REVOKED_CLOSE_STATUS = CloseStatus.POLICY_VIOLATION.withReason("Session revoked");

    private final ConcurrentMap<String, RegisteredWebSocketSession> sessionsByWebSocketSessionId = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, java.util.Set<String>> webSocketSessionIdsByUsername = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, WebSocketSession> transportSessionsByWebSocketSessionId = new ConcurrentHashMap<>();

    public void register(String webSocketSessionId, String username, UUID authSessionId) {
        if (!StringUtils.hasText(webSocketSessionId) || !StringUtils.hasText(username) || authSessionId == null) {
            return;
        }

        RegisteredWebSocketSession registeredSession =
                new RegisteredWebSocketSession(webSocketSessionId, username, authSessionId);
        RegisteredWebSocketSession previous = sessionsByWebSocketSessionId.put(webSocketSessionId, registeredSession);
        if (previous != null) {
            removeFromUsernameIndex(previous);
        }

        webSocketSessionIdsByUsername
                .computeIfAbsent(username, ignored -> ConcurrentHashMap.newKeySet())
                .add(webSocketSessionId);
    }

    public void unregister(String webSocketSessionId) {
        if (!StringUtils.hasText(webSocketSessionId)) {
            return;
        }

        transportSessionsByWebSocketSessionId.remove(webSocketSessionId);
        RegisteredWebSocketSession removed = sessionsByWebSocketSessionId.remove(webSocketSessionId);
        if (removed == null) {
            return;
        }

        removeFromUsernameIndex(removed);
    }

    public List<RegisteredWebSocketSession> findSessionsByUsername(String username) {
        if (!StringUtils.hasText(username)) {
            return List.of();
        }

        java.util.Set<String> webSocketSessionIds = webSocketSessionIdsByUsername.get(username);
        if (webSocketSessionIds == null || webSocketSessionIds.isEmpty()) {
            return List.of();
        }

        return webSocketSessionIds.stream()
                .map(sessionsByWebSocketSessionId::get)
                .filter(Objects::nonNull)
                .toList();
    }

    public Optional<RegisteredWebSocketSession> findByWebSocketSessionId(String webSocketSessionId) {
        if (!StringUtils.hasText(webSocketSessionId)) {
            return Optional.empty();
        }

        return Optional.ofNullable(sessionsByWebSocketSessionId.get(webSocketSessionId));
    }

    public void attachTransportSession(WebSocketSession session) {
        if (session == null || !StringUtils.hasText(session.getId())) {
            return;
        }

        transportSessionsByWebSocketSessionId.put(session.getId(), session);
    }

    public void detachTransportSession(String webSocketSessionId) {
        if (!StringUtils.hasText(webSocketSessionId)) {
            return;
        }

        transportSessionsByWebSocketSessionId.remove(webSocketSessionId);
    }

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        unregister(event.getSessionId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSessionRevoked(SessionRevokedEvent event) {
        closeRevokedSession(event);
    }

    public void closeRevokedSession(SessionRevokedEvent event) {
        for (RegisteredWebSocketSession session : findSessionsByUsername(event.username())) {
            if (!session.authSessionId().equals(event.sessionId())) {
                continue;
            }

            WebSocketSession transportSession = transportSessionsByWebSocketSessionId.get(session.webSocketSessionId());
            if (transportSession == null) {
                unregister(session.webSocketSessionId());
                continue;
            }

            try {
                if (transportSession.isOpen()) {
                    transportSession.close(SESSION_REVOKED_CLOSE_STATUS);
                }
            } catch (IOException exception) {
                log.warn(
                        "Failed to close revoked websocket session user={} authSessionId={} webSocketSessionId={}",
                        session.username(),
                        session.authSessionId(),
                        session.webSocketSessionId(),
                        exception
                );
            } finally {
                unregister(session.webSocketSessionId());
            }
        }
    }

    private void removeFromUsernameIndex(RegisteredWebSocketSession registeredSession) {
        java.util.Set<String> indexedSessionIds = webSocketSessionIdsByUsername.get(registeredSession.username());
        if (indexedSessionIds == null) {
            return;
        }

        indexedSessionIds.remove(registeredSession.webSocketSessionId());
        if (indexedSessionIds.isEmpty()) {
            webSocketSessionIdsByUsername.remove(registeredSession.username(), indexedSessionIds);
        }
    }

    public record RegisteredWebSocketSession(
            String webSocketSessionId,
            String username,
            UUID authSessionId
    ) {
    }
}
