package com.north.messenger.application.message;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.config.AuthenticatedWebSocketSessionRegistry;
import com.north.messenger.config.AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession;
import java.util.Map;
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
        for (RegisteredWebSocketSession session : webSocketSessionRegistry.findSessionsByUsername(username)) {
            if (!authService.isSessionActive(username, session.authSessionId())) {
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
