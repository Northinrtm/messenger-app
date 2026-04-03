package com.north.messenger.application.message;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisTypingStateStore implements TypingStateStore {

    private static final String KEY_PREFIX = "messenger:typing:";

    private final StringRedisTemplate redisTemplate;
    private final Duration keyTtl;

    public RedisTypingStateStore(
            StringRedisTemplate redisTemplate,
            @Value("${app.realtime.typing-active-window-ms:10000}") long activeTypingWindowMillis
    ) {
        this.redisTemplate = redisTemplate;
        this.keyTtl = Duration.ofMillis(activeTypingWindowMillis * 3L);
    }

    @Override
    public void markTyping(UUID chatId, UUID userId, Instant at) {
        String key = key(chatId);
        redisTemplate.opsForZSet().add(key, userId.toString(), at.toEpochMilli());
        redisTemplate.expire(key, keyTtl);
    }

    @Override
    public void clearTyping(UUID chatId, UUID userId) {
        redisTemplate.opsForZSet().remove(key(chatId), userId.toString());
    }

    @Override
    public Set<UUID> listTypingUserIds(UUID chatId, Instant threshold) {
        String key = key(chatId);
        redisTemplate.opsForZSet().removeRangeByScore(key, Double.NEGATIVE_INFINITY, threshold.toEpochMilli() - 1d);
        Set<String> activeUserIds = redisTemplate.opsForZSet().rangeByScore(
                key,
                threshold.toEpochMilli(),
                Double.POSITIVE_INFINITY
        );
        if (activeUserIds == null || activeUserIds.isEmpty()) {
            return Set.of();
        }

        return activeUserIds.stream()
                .map(this::parseUuid)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    @Override
    public void purgeExpiredEntries(Instant threshold) {
        // Redis keys are self-expiring and are also lazily cleaned during reads.
    }

    private String key(UUID chatId) {
        return KEY_PREFIX + chatId;
    }

    private UUID parseUuid(String rawValue) {
        try {
            return UUID.fromString(rawValue);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
