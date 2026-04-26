package com.north.messenger.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

@Component
public class WebSocketSessionTrackingDecoratorFactory implements WebSocketHandlerDecoratorFactory {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionTrackingDecoratorFactory.class);

    private final AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;

    public WebSocketSessionTrackingDecoratorFactory(AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry) {
        this.webSocketSessionRegistry = webSocketSessionRegistry;
    }

    @Override
    public WebSocketHandler decorate(WebSocketHandler delegate) {
        return new WebSocketHandlerDecorator(delegate) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                webSocketSessionRegistry.attachTransportSession(session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
                try {
                    AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession registeredSession =
                            webSocketSessionRegistry.findByWebSocketSessionId(session.getId()).orElse(null);
                    log.warn(
                            "WebSocket transport error webSocketSessionId={} username={} authSessionId={} uri={} open={}",
                            session.getId(),
                            registeredSession != null ? registeredSession.username() : null,
                            registeredSession != null ? registeredSession.authSessionId() : null,
                            session.getUri(),
                            session.isOpen(),
                            exception
                    );
                } finally {
                    super.handleTransportError(session, exception);
                }
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
                try {
                    if (closeStatus != null && closeStatus.getCode() != CloseStatus.NORMAL.getCode()) {
                        AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession registeredSession =
                                webSocketSessionRegistry.findByWebSocketSessionId(session.getId()).orElse(null);
                        log.warn(
                                "WebSocket closed abnormally webSocketSessionId={} username={} authSessionId={} uri={} code={} reason={}",
                                session.getId(),
                                registeredSession != null ? registeredSession.username() : null,
                                registeredSession != null ? registeredSession.authSessionId() : null,
                                session.getUri(),
                                closeStatus.getCode(),
                                closeStatus.getReason()
                        );
                    }
                    super.afterConnectionClosed(session, closeStatus);
                } finally {
                    webSocketSessionRegistry.detachTransportSession(session.getId());
                }
            }
        };
    }
}
