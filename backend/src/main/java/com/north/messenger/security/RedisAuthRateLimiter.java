package com.north.messenger.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.auth.rate-limit.redis.enabled", havingValue = "true")
public class RedisAuthRateLimiter implements AuthRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisAuthRateLimiter.class);
    private static final String KEY_PREFIX = "messenger:auth-rate-limit:";
    private static final DefaultRedisScript<List> RATE_LIMIT_SCRIPT = new DefaultRedisScript<>(
            """
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
              redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            local ttl = redis.call('PTTL', KEYS[1])
            return {current, ttl}
            """,
            List.class
    );

    private final StringRedisTemplate redisTemplate;
    private final InMemoryAuthRateLimiter localFallback = new InMemoryAuthRateLimiter();

    public RedisAuthRateLimiter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public AuthRateLimitDecision acquire(
            String path,
            String clientAddress,
            AuthRateLimitPolicy policy,
            long nowEpochMillis
    ) {
        try {
            List<?> result = redisTemplate.execute(
                    RATE_LIMIT_SCRIPT,
                    List.of(redisKey(path, clientAddress)),
                    Long.toString(policy.window().toMillis())
            );
            if (result == null || result.size() < 2) {
                throw new IllegalStateException("Redis rate limit script returned no result");
            }

            long count = toLong(result.get(0));
            long ttlMillis = Math.max(toLong(result.get(1)), 1L);
            if (count > policy.limit()) {
                return new AuthRateLimitDecision(false, Duration.ofMillis(ttlMillis).toSeconds());
            }
            return new AuthRateLimitDecision(true, 0);
        } catch (RuntimeException exception) {
            log.warn("Redis auth rate limiter unavailable; falling back to local limiter path={}", path, exception);
            return localFallback.acquire(path, clientAddress, policy, nowEpochMillis);
        }
    }

    private String redisKey(String path, String clientAddress) {
        return KEY_PREFIX + sha256(path + "\n" + clientAddress);
    }

    private long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for Redis rate limit keys", exception);
        }
    }
}
