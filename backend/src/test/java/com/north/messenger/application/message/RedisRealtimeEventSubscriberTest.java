package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RedisRealtimeEventSubscriberTest {

    private ObjectMapper objectMapper;
    private SimpMessagingTemplate messagingTemplate;
    private AuthenticatedWebSocketUserDelivery authenticatedWebSocketUserDelivery;
    private RedisRealtimeIntegrityService redisRealtimeIntegrityService;
    private RedisRealtimeEventSubscriber subscriber;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        messagingTemplate = mock(SimpMessagingTemplate.class);
        authenticatedWebSocketUserDelivery = mock(AuthenticatedWebSocketUserDelivery.class);
        redisRealtimeIntegrityService = new RedisRealtimeIntegrityService("test-redis-mac-secret");
        subscriber = new RedisRealtimeEventSubscriber(
                objectMapper,
                messagingTemplate,
                authenticatedWebSocketUserDelivery,
                redisRealtimeIntegrityService
        );
    }

    @Test
    void shouldForwardAllowedUserDestination() throws Exception {
        String payload = signedPayload(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.USER,
                "/queue/messages",
                "north",
                "{\"type\":\"message\"}"
        ));

        subscriber.handleMessage(payload);

        verify(authenticatedWebSocketUserDelivery).sendToUser("north", "/queue/messages", "{\"type\":\"message\"}");
    }

    @Test
    void shouldDropUnsupportedUserDestination() throws Exception {
        String payload = signedPayload(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.USER,
                "/queue/admin",
                "north",
                "{\"type\":\"message\"}"
        ));

        subscriber.handleMessage(payload);

        verify(authenticatedWebSocketUserDelivery, never()).sendToUser(any(), any(), any());
    }

    @Test
    void shouldForwardAllowedTypingTopic() throws Exception {
        String destination = "/topic/chats." + UUID.randomUUID() + ".typing";
        String payload = signedPayload(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.TOPIC,
                destination,
                null,
                "{\"type\":\"typing\"}"
        ));

        subscriber.handleMessage(payload);

        verify(messagingTemplate).convertAndSend(eq(destination), eq("{\"type\":\"typing\"}"));
    }

    @Test
    void shouldDropUnsupportedTopicDestination() throws Exception {
        String payload = signedPayload(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.TOPIC,
                "/topic/chats.broadcast",
                null,
                "{\"type\":\"typing\"}"
        ));

        subscriber.handleMessage(payload);

        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    void shouldDropRealtimeEventWithoutMac() throws Exception {
        String payload = objectMapper.writeValueAsString(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.USER,
                "/queue/messages",
                "north",
                "{\"type\":\"message\"}"
        ));

        subscriber.handleMessage(payload);

        verify(authenticatedWebSocketUserDelivery, never()).sendToUser(any(), any(), any());
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    void shouldDropRealtimeEventWithInvalidMac() throws Exception {
        String payload = objectMapper.writeValueAsString(new RedisDistributedRealtimeEvent(
                RedisDistributedRealtimeEvent.DeliveryMode.USER,
                "/queue/messages",
                "north",
                "{\"type\":\"message\"}",
                "invalid-mac"
        ));

        subscriber.handleMessage(payload);

        verify(authenticatedWebSocketUserDelivery, never()).sendToUser(any(), any(), any());
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    private String signedPayload(RedisDistributedRealtimeEvent event) throws Exception {
        return objectMapper.writeValueAsString(redisRealtimeIntegrityService.sign(event));
    }
}
