package com.north.messenger.application.message;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisTypingStateStore implements TypingStateStore {

    private static final String KEY_PREFIX = "messenger:typing:";
    private static final String MAC_KEY_PREFIX = "messenger:typing:mac:";

    private final StringRedisTemplate redisTemplate;
    private final RedisRealtimeIntegrityService redisRealtimeIntegrityService;
    private final Duration keyTtl;

    public RedisTypingStateStore(
            StringRedisTemplate redisTemplate,
            RedisRealtimeIntegrityService redisRealtimeIntegrityService,
            @Value("${app.realtime.typing-active-window-ms:10000}") long activeTypingWindowMillis
    ) {
        this.redisTemplate = redisTemplate;
        this.redisRealtimeIntegrityService = redisRealtimeIntegrityService;
        this.keyTtl = Duration.ofMillis(activeTypingWindowMillis * 3L);
    }

    @Override
    public void markTyping(UUID chatId, UUID userId, Instant at) {
        String key = key(chatId);
        String macKey = macKey(chatId);
        String member = userId.toString();
        long updatedAtEpochMillis = at.toEpochMilli();
        redisTemplate.opsForZSet().add(key, member, updatedAtEpochMillis);
        redisTemplate.opsForHash().put(
                macKey,
                member,
                redisRealtimeIntegrityService.signTypingState(chatId, userId, updatedAtEpochMillis)
        );
        redisTemplate.expire(key, keyTtl);
        redisTemplate.expire(macKey, keyTtl);
    }

    @Override
    public void clearTyping(UUID chatId, UUID userId) {
        String member = userId.toString();
        redisTemplate.opsForZSet().remove(key(chatId), member);
        redisTemplate.opsForHash().delete(macKey(chatId), member);
    }

    @Override
    public Set<UUID> listTypingUserIds(UUID chatId, Instant threshold) {
        String key = key(chatId);
        String macKey = macKey(chatId);
        long thresholdEpochMillis = threshold.toEpochMilli();
        Set<String> expiredUserIds = redisTemplate.opsForZSet().rangeByScore(
                key,
                Double.NEGATIVE_INFINITY,
                thresholdEpochMillis - 1d
        );
        if (expiredUserIds != null && !expiredUserIds.isEmpty()) {
            removeEntries(key, macKey, expiredUserIds);
        }

        Set<ZSetOperations.TypedTuple<String>> activeEntries = redisTemplate.opsForZSet().rangeByScoreWithScores(
                key,
                thresholdEpochMillis,
                Double.POSITIVE_INFINITY
        );
        if (activeEntries == null || activeEntries.isEmpty()) {
            return Set.of();
        }

        Set<String> invalidUserIds = new LinkedHashSet<>();
        Set<UUID> validUserIds = new LinkedHashSet<>();
        for (ZSetOperations.TypedTuple<String> activeEntry : activeEntries) {
            String rawUserId = activeEntry.getValue();
            UUID userId = parseUuid(rawUserId);
            Long updatedAtEpochMillis = normalizeEpochMillis(activeEntry.getScore());
            Object mac = rawUserId != null ? redisTemplate.opsForHash().get(macKey, rawUserId) : null;
            if (userId == null
                    || updatedAtEpochMillis == null
                    || !(mac instanceof String macValue)
                    || !redisRealtimeIntegrityService.isAuthenticTypingState(
                            chatId,
                            userId,
                            updatedAtEpochMillis,
                            macValue
                    )) {
                if (rawUserId != null) {
                    invalidUserIds.add(rawUserId);
                }
                continue;
            }
            validUserIds.add(userId);
        }

        if (!invalidUserIds.isEmpty()) {
            removeEntries(key, macKey, invalidUserIds);
        }

        return validUserIds;
    }

    @Override
    public void purgeExpiredEntries(Instant threshold) {
        // Redis keys are self-expiring and are also lazily cleaned during reads.
    }

    private String key(UUID chatId) {
        return KEY_PREFIX + chatId;
    }

    private String macKey(UUID chatId) {
        return MAC_KEY_PREFIX + chatId;
    }

    private void removeEntries(String key, String macKey, Set<String> userIds) {
        Object[] members = userIds.toArray();
        redisTemplate.opsForZSet().remove(key, members);
        redisTemplate.opsForHash().delete(macKey, members);
    }

    private Long normalizeEpochMillis(Double rawScore) {
        if (rawScore == null || !Double.isFinite(rawScore)) {
            return null;
        }
        long epochMillis = rawScore.longValue();
        return rawScore.doubleValue() == (double) epochMillis ? epochMillis : null;
    }

    private UUID parseUuid(String rawValue) {
        try {
            return UUID.fromString(rawValue);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
