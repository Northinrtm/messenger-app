package com.north.messenger.application.message;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.config.AuthenticatedWebSocketSessionRegistry;
import com.north.messenger.config.AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class AuthenticatedWebSocketUserDelivery {

    private final SimpMessagingTemplate messagingTemplate;
    private final AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;
    private final AuthService authService;

    public AuthenticatedWebSocketUserDelivery(
            SimpMessagingTemplate messagingTemplate,
            AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry,
            AuthService authService
    ) {
        this.messagingTemplate = messagingTemplate;
        this.webSocketSessionRegistry = webSocketSessionRegistry;
        this.authService = authService;
    }

    public void sendToUser(String username, String destination, Object payload) {
        List<RegisteredWebSocketSession> sessions = webSocketSessionRegistry.findSessionsByUsername(username);
        if (sessions.isEmpty()) {
            return;
        }

        UUID userId = sessions.get(0).userId();
        Set<UUID> authorizedSessionIds = authService.findAuthorizedSessionIds(
                userId,
                sessions.stream()
                        .map(RegisteredWebSocketSession::authSessionId)
                        .collect(Collectors.toSet())
        );
        for (RegisteredWebSocketSession session : sessions) {
            if (!authorizedSessionIds.contains(session.authSessionId())) {
                webSocketSessionRegistry.unregister(session.webSocketSessionId());
                continue;
            }

            messagingTemplate.convertAndSendToUser(
                    session.webSocketSessionId(),
                    destination,
                    payload,
                    sessionHeaders(session.webSocketSessionId())
            );
        }
    }

    private Map<String, Object> sessionHeaders(String webSocketSessionId) {
        SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setSessionId(webSocketSessionId);
        accessor.setLeaveMutable(true);
        return accessor.getMessageHeaders();
    }
}
