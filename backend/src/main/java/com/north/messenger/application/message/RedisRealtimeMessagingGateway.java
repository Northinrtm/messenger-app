package com.north.messenger.application.message;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode;
import com.north.messenger.config.RedisRealtimeConfig;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisRealtimeMessagingGateway implements RealtimeMessagingGateway {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisRealtimeMessagingGateway(
            StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper
    ) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void sendToTopic(String destination, Object payload) {
        publish(new RedisDistributedRealtimeEvent(
                DeliveryMode.TOPIC,
                destination,
                null,
                serialize(payload)
        ));
    }

    @Override
    public void sendToUser(String username, String destination, Object payload) {
        publish(new RedisDistributedRealtimeEvent(
                DeliveryMode.USER,
                destination,
                username,
                serialize(payload)
        ));
    }

    private void publish(RedisDistributedRealtimeEvent event) {
        redisTemplate.convertAndSend(RedisRealtimeConfig.REALTIME_CHANNEL, serialize(event));
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to serialize realtime payload"
            );
        }
    }
}
