package com.north.messenger.application.message;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "false", matchIfMissing = true)
public class InMemoryTypingStateStore implements TypingStateStore {

    private final ConcurrentMap<UUID, ConcurrentMap<UUID, Instant>> typingByChatId = new ConcurrentHashMap<>();

    @Override
    public void markTyping(UUID chatId, UUID userId, Instant at) {
        typingByChatId.computeIfAbsent(chatId, ignored -> new ConcurrentHashMap<>())
                .put(userId, at);
    }

    @Override
    public void clearTyping(UUID chatId, UUID userId) {
        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null) {
            return;
        }

        chatTyping.remove(userId);
        if (chatTyping.isEmpty()) {
            typingByChatId.remove(chatId, chatTyping);
        }
    }

    @Override
    public void clearAllTypingForUser(UUID userId) {
        typingByChatId.forEach((chatId, chatTyping) -> chatTyping.remove(userId));
        typingByChatId.entrySet().removeIf(entry -> entry.getValue().isEmpty());
    }

    @Override
    public Set<UUID> listTypingUserIds(UUID chatId, Instant threshold) {
        cleanupExpiredTypingEntries(chatId, threshold);

        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null || chatTyping.isEmpty()) {
            return Set.of();
        }

        return chatTyping.entrySet().stream()
                .filter(entry -> !entry.getValue().isBefore(threshold))
                .map(java.util.Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    @Override
    public void purgeExpiredEntries(Instant threshold) {
        typingByChatId.keySet().forEach(chatId -> cleanupExpiredTypingEntries(chatId, threshold));
    }

    private void cleanupExpiredTypingEntries(UUID chatId, Instant threshold) {
        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null || chatTyping.isEmpty()) {
            return;
        }

        chatTyping.entrySet().removeIf(entry -> entry.getValue().isBefore(threshold));
        if (chatTyping.isEmpty()) {
            typingByChatId.remove(chatId, chatTyping);
        }
    }
}
