package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisRealtimeEventSubscriber {

    private static final Set<String> ALLOWED_USER_DESTINATIONS = Set.of(
            "/queue/messages",
            "/queue/message-statuses",
            "/queue/message-reactions",
            "/queue/message-deletions",
            "/queue/chats",
            "/queue/chat-removals",
            "/queue/sessions"
    );
    private static final Pattern ALLOWED_TOPIC_DESTINATION = Pattern.compile("^/topic/chats\\.[0-9a-fA-F-]{36}\\.typing$");
    private static final Logger log = LoggerFactory.getLogger(RedisRealtimeEventSubscriber.class);

    private final ObjectMapper objectMapper;
    private final SimpMessagingTemplate messagingTemplate;
    private final AuthenticatedWebSocketUserDelivery authenticatedWebSocketUserDelivery;
    private final RedisRealtimeIntegrityService redisRealtimeIntegrityService;

    public RedisRealtimeEventSubscriber(
            ObjectMapper objectMapper,
            SimpMessagingTemplate messagingTemplate,
            AuthenticatedWebSocketUserDelivery authenticatedWebSocketUserDelivery,
            RedisRealtimeIntegrityService redisRealtimeIntegrityService
    ) {
        this.objectMapper = objectMapper;
        this.messagingTemplate = messagingTemplate;
        this.authenticatedWebSocketUserDelivery = authenticatedWebSocketUserDelivery;
        this.redisRealtimeIntegrityService = redisRealtimeIntegrityService;
    }

    public void handleMessage(String rawPayload) throws Exception {
        RedisDistributedRealtimeEvent event = objectMapper.readValue(
                rawPayload,
                RedisDistributedRealtimeEvent.class
        );
        if (!redisRealtimeIntegrityService.isAuthentic(event)) {
            log.warn(
                    "Dropping realtime event with invalid MAC deliveryMode={} destination={} username={}",
                    event.deliveryMode(),
                    event.destination(),
                    event.username()
            );
            return;
        }

        if (event.deliveryMode() == DeliveryMode.USER) {
            if (event.username() == null || event.username().isBlank() || !ALLOWED_USER_DESTINATIONS.contains(event.destination())) {
                log.warn(
                        "Dropping realtime user event with unsupported routing username={} destination={}",
                        event.username(),
                        event.destination()
                );
                return;
            }
            authenticatedWebSocketUserDelivery.sendToUser(event.username(), event.destination(), event.payload());
            return;
        }

        if (event.destination() == null || !ALLOWED_TOPIC_DESTINATION.matcher(event.destination()).matches()) {
            log.warn("Dropping realtime topic event with unsupported destination={}", event.destination());
            return;
        }
        messagingTemplate.convertAndSend(event.destination(), event.payload());
    }
}
