package com.north.messenger.application.message;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "false", matchIfMissing = true)
public class LocalRealtimeMessagingGateway implements RealtimeMessagingGateway {

    private final SimpMessagingTemplate messagingTemplate;
    private final AuthenticatedWebSocketUserDelivery authenticatedWebSocketUserDelivery;

    public LocalRealtimeMessagingGateway(
            SimpMessagingTemplate messagingTemplate,
            AuthenticatedWebSocketUserDelivery authenticatedWebSocketUserDelivery
    ) {
        this.messagingTemplate = messagingTemplate;
        this.authenticatedWebSocketUserDelivery = authenticatedWebSocketUserDelivery;
    }

    @Override
    public void sendToTopic(String destination, Object payload) {
        messagingTemplate.convertAndSend(destination, payload);
    }

    @Override
    public void sendToUser(String username, String destination, Object payload) {
        authenticatedWebSocketUserDelivery.sendToUser(username, destination, payload);
    }
}
