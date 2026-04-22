package com.north.messenger.application.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent;
import com.north.messenger.application.message.RedisRealtimeIntegrityService;
import com.north.messenger.security.JwtProperties;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RedisSessionRevocationPublisherTest {

    private ObjectMapper objectMapper;
    private StringRedisTemplate redisTemplate;
    private RedisRealtimeIntegrityService redisRealtimeIntegrityService;
    private RedisSessionRevocationPublisher publisher;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        redisTemplate = mock(StringRedisTemplate.class);
        redisRealtimeIntegrityService = new RedisRealtimeIntegrityService(
                "test-redis-mac-secret",
                new JwtProperties(
                        "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
                        Duration.ofHours(12),
                        Duration.ofDays(30),
                        "north-messenger",
                        "north-messenger-clients",
                        false
                )
        );
        publisher = new RedisSessionRevocationPublisher(redisTemplate, objectMapper, redisRealtimeIntegrityService);
    }

    @Test
    void shouldPublishSignedSessionRevocationEvent() throws Exception {
        UUID sessionId = UUID.randomUUID();

        publisher.publish(new SessionRevokedEvent("north", sessionId));

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisTemplate).convertAndSend(eq("messenger:realtime-events"), payloadCaptor.capture());

        RedisDistributedRealtimeEvent event = objectMapper.readValue(
                payloadCaptor.getValue(),
                RedisDistributedRealtimeEvent.class
        );
        assertThat(event.deliveryMode()).isEqualTo(RedisDistributedRealtimeEvent.DeliveryMode.SESSION_REVOKED);
        assertThat(event.username()).isEqualTo("north");
        assertThat(event.payload()).isEqualTo(sessionId.toString());
        assertThat(redisRealtimeIntegrityService.isAuthentic(event)).isTrue();
    }
}
