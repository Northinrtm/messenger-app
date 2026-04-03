package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisRealtimeEventSubscriber {

    private final ObjectMapper objectMapper;
    private final SimpMessagingTemplate messagingTemplate;

    public RedisRealtimeEventSubscriber(
            ObjectMapper objectMapper,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.objectMapper = objectMapper;
        this.messagingTemplate = messagingTemplate;
    }

    public void handleMessage(String rawPayload) throws Exception {
        RedisDistributedRealtimeEvent event = objectMapper.readValue(
                rawPayload,
                RedisDistributedRealtimeEvent.class
        );
        if (event.deliveryMode() == DeliveryMode.USER) {
            messagingTemplate.convertAndSendToUser(event.username(), event.destination(), event.payload());
            return;
        }

        messagingTemplate.convertAndSend(event.destination(), event.payload());
    }
}
