package com.north.messenger.application.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent;
import com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode;
import com.north.messenger.application.message.RedisRealtimeIntegrityService;
import com.north.messenger.config.RedisRealtimeConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisSessionRevocationPublisher {

    private static final Logger log = LoggerFactory.getLogger(RedisSessionRevocationPublisher.class);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisRealtimeIntegrityService redisRealtimeIntegrityService;

    public RedisSessionRevocationPublisher(
            StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            RedisRealtimeIntegrityService redisRealtimeIntegrityService
    ) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.redisRealtimeIntegrityService = redisRealtimeIntegrityService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void publish(SessionRevokedEvent event) {
        try {
            RedisDistributedRealtimeEvent redisEvent = new RedisDistributedRealtimeEvent(
                    DeliveryMode.SESSION_REVOKED,
                    null,
                    event.username(),
                    event.sessionId().toString()
            );
            redisTemplate.convertAndSend(
                    RedisRealtimeConfig.REALTIME_CHANNEL,
                    objectMapper.writeValueAsString(redisRealtimeIntegrityService.sign(redisEvent))
            );
        } catch (JsonProcessingException | RuntimeException exception) {
            log.warn(
                    "Failed to publish session revocation event username={} sessionId={}",
                    event.username(),
                    event.sessionId(),
                    exception
            );
        }
    }
}
