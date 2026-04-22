package com.north.messenger.application.message;

import com.north.messenger.security.JwtProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;

import static com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode.USER;
import static org.assertj.core.api.Assertions.assertThat;

class RedisRealtimeIntegrityServiceTest {

    private static final JwtProperties JWT_PROPERTIES = new JwtProperties(
            "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
            Duration.ofMinutes(30),
            Duration.ofDays(30),
            "north-messenger",
            "north-messenger-clients",
            false
    );

    @Test
    void shouldFallbackToJwtSecretWhenRedisMacSecretIsBlank() {
        RedisRealtimeIntegrityService integrityService =
                new RedisRealtimeIntegrityService("", JWT_PROPERTIES);

        RedisDistributedRealtimeEvent signedEvent = integrityService.sign(new RedisDistributedRealtimeEvent(
                USER,
                "/queue/messages",
                "north",
                "{\"type\":\"test\"}"
        ));

        assertThat(integrityService.isAuthentic(signedEvent)).isTrue();
    }

    @Test
    void explicitRedisMacSecretShouldTakePrecedenceOverJwtSecret() {
        RedisRealtimeIntegrityService explicitSecretService =
                new RedisRealtimeIntegrityService("explicit-redis-secret", JWT_PROPERTIES);
        RedisRealtimeIntegrityService jwtFallbackService =
                new RedisRealtimeIntegrityService("", JWT_PROPERTIES);

        RedisDistributedRealtimeEvent signedEvent = explicitSecretService.sign(new RedisDistributedRealtimeEvent(
                USER,
                "/queue/messages",
                "north",
                "{\"type\":\"test\"}"
        ));

        assertThat(jwtFallbackService.isAuthentic(signedEvent)).isFalse();
    }
}
