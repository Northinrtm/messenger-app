package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RedisRealtimeMessagingGatewayTest {

    private ObjectMapper objectMapper;
    private StringRedisTemplate redisTemplate;
    private RedisRealtimeIntegrityService redisRealtimeIntegrityService;
    private RedisRealtimeMessagingGateway gateway;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        redisTemplate = mock(StringRedisTemplate.class);
        redisRealtimeIntegrityService = new RedisRealtimeIntegrityService("test-redis-mac-secret");
        gateway = new RedisRealtimeMessagingGateway(redisTemplate, objectMapper, redisRealtimeIntegrityService);
    }

    @Test
    void shouldPublishMacProtectedRealtimeEnvelope() throws Exception {
        gateway.sendToUser("north", "/queue/messages", java.util.Map.of("type", "message"));

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisTemplate).convertAndSend(eq("messenger:realtime-events"), payloadCaptor.capture());

        RedisDistributedRealtimeEvent event = objectMapper.readValue(
                payloadCaptor.getValue(),
                RedisDistributedRealtimeEvent.class
        );
        assertThat(event.mac()).isNotBlank();
        assertThat(redisRealtimeIntegrityService.isAuthentic(event)).isTrue();
    }
}
