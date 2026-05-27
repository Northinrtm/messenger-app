package com.north.messenger.application.message;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.DefaultTypedTuple;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisTypingStateStoreTest {

    private StringRedisTemplate redisTemplate;
    private ZSetOperations<String, String> zSetOperations;
    private HashOperations<String, Object, Object> hashOperations;
    private SetOperations<String, String> setOperations;
    private RedisRealtimeIntegrityService redisRealtimeIntegrityService;
    private RedisTypingStateStore redisTypingStateStore;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        zSetOperations = mock(ZSetOperations.class);
        hashOperations = mock(HashOperations.class);
        setOperations = mock(SetOperations.class);
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);

        redisRealtimeIntegrityService = new RedisRealtimeIntegrityService("test-redis-mac-secret");
        redisTypingStateStore = new RedisTypingStateStore(redisTemplate, redisRealtimeIntegrityService, 10_000);
    }

    @Test
    void markTypingShouldPersistMacBoundToChatUserAndTimestamp() {
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Instant at = Instant.parse("2026-04-17T10:15:30Z");

        redisTypingStateStore.markTyping(chatId, userId, at);

        String key = "messenger:typing:" + chatId;
        String macKey = "messenger:typing:mac:" + chatId;
        String userChatsKey = "messenger:typing:user-chats:" + userId;
        verify(zSetOperations).add(key, userId.toString(), (double) at.toEpochMilli());

        ArgumentCaptor<Object> macCaptor = ArgumentCaptor.forClass(Object.class);
        verify(hashOperations).put(eq(macKey), eq(userId.toString()), macCaptor.capture());
        assertThat(macCaptor.getValue()).isInstanceOf(String.class);
        assertThat(redisRealtimeIntegrityService.isAuthenticTypingState(
                chatId,
                userId,
                at.toEpochMilli(),
                (String) macCaptor.getValue()
        )).isTrue();

        verify(redisTemplate).expire(key, Duration.ofMillis(30_000));
        verify(redisTemplate).expire(macKey, Duration.ofMillis(30_000));
        // Verify reverse index is updated
        verify(setOperations).add(userChatsKey, chatId.toString());
        verify(redisTemplate).expire(userChatsKey, Duration.ofMillis(30_000));
    }

    @Test
    void listTypingUserIdsShouldFilterAndPurgeEntriesWithoutValidMac() {
        UUID chatId = UUID.randomUUID();
        UUID validUserId = UUID.randomUUID();
        UUID tamperedUserId = UUID.randomUUID();
        Instant threshold = Instant.parse("2026-04-17T10:15:30Z");
        long validTimestamp = threshold.plusMillis(1_000).toEpochMilli();
        long tamperedTimestamp = threshold.plusMillis(2_000).toEpochMilli();
        String key = "messenger:typing:" + chatId;
        String macKey = "messenger:typing:mac:" + chatId;

        when(zSetOperations.rangeByScore(eq(key), anyDouble(), eq(threshold.toEpochMilli() - 1d)))
                .thenReturn(Set.of());
        Set<ZSetOperations.TypedTuple<String>> activeEntries = new LinkedHashSet<>();
        activeEntries.add(new DefaultTypedTuple<>(validUserId.toString(), (double) validTimestamp));
        activeEntries.add(new DefaultTypedTuple<>(tamperedUserId.toString(), (double) tamperedTimestamp));
        when(zSetOperations.rangeByScoreWithScores(eq(key), eq((double) threshold.toEpochMilli()), anyDouble()))
                .thenReturn(activeEntries);
        when(hashOperations.get(macKey, validUserId.toString()))
                .thenReturn(redisRealtimeIntegrityService.signTypingState(chatId, validUserId, validTimestamp));
        when(hashOperations.get(macKey, tamperedUserId.toString())).thenReturn("invalid-mac");

        assertThat(redisTypingStateStore.listTypingUserIds(chatId, threshold))
                .containsExactly(validUserId);

        ArgumentCaptor<Object[]> zsetRemovalCaptor = ArgumentCaptor.forClass(Object[].class);
        ArgumentCaptor<Object[]> hashRemovalCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(zSetOperations).remove(eq(key), zsetRemovalCaptor.capture());
        verify(hashOperations).delete(eq(macKey), hashRemovalCaptor.capture());
        assertThat(zsetRemovalCaptor.getValue()).containsExactly(tamperedUserId.toString());
        assertThat(hashRemovalCaptor.getValue()).containsExactly(tamperedUserId.toString());
    }

    @Test
    void clearTypingShouldRemoveUserFromScoreSetMacIndexAndReverseIndex() {
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String key = "messenger:typing:" + chatId;
        String macKey = "messenger:typing:mac:" + chatId;
        String userChatsKey = "messenger:typing:user-chats:" + userId;

        redisTypingStateStore.clearTyping(chatId, userId);

        ArgumentCaptor<Object[]> zsetRemovalCaptor = ArgumentCaptor.forClass(Object[].class);
        ArgumentCaptor<Object[]> hashRemovalCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(zSetOperations).remove(eq(key), zsetRemovalCaptor.capture());
        verify(hashOperations).delete(eq(macKey), hashRemovalCaptor.capture());
        assertThat(zsetRemovalCaptor.getValue()).containsExactly(userId.toString());
        assertThat(hashRemovalCaptor.getValue()).containsExactly(userId.toString());
        verify(setOperations).remove(userChatsKey, chatId.toString());
    }

    @Test
    void clearAllTypingForUserShouldRemoveUserFromAllChatsAndDeleteReverseIndex() {
        UUID userId = UUID.randomUUID();
        UUID chatId1 = UUID.randomUUID();
        UUID chatId2 = UUID.randomUUID();
        String userChatsKey = "messenger:typing:user-chats:" + userId;

        when(setOperations.members(userChatsKey))
                .thenReturn(Set.of(chatId1.toString(), chatId2.toString()));

        redisTypingStateStore.clearAllTypingForUser(userId);

        String userIdStr = userId.toString();
        verify(zSetOperations).remove("messenger:typing:" + chatId1, userIdStr);
        verify(hashOperations).delete("messenger:typing:mac:" + chatId1, userIdStr);
        verify(zSetOperations).remove("messenger:typing:" + chatId2, userIdStr);
        verify(hashOperations).delete("messenger:typing:mac:" + chatId2, userIdStr);
        verify(redisTemplate).delete(userChatsKey);
    }

    @Test
    void clearAllTypingForUserShouldHandleEmptyReverseIndex() {
        UUID userId = UUID.randomUUID();
        String userChatsKey = "messenger:typing:user-chats:" + userId;

        when(setOperations.members(userChatsKey)).thenReturn(Set.of());

        redisTypingStateStore.clearAllTypingForUser(userId);

        verify(redisTemplate).delete(userChatsKey);
    }
}
