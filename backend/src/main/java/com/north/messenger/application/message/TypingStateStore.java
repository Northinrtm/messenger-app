package com.north.messenger.application.message;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public interface TypingStateStore {

    void markTyping(UUID chatId, UUID userId, Instant at);

    void clearTyping(UUID chatId, UUID userId);

    /**
     * Immediately removes all typing state for {@code userId} across every chat.
     * Called when a WebSocket session is closed so that the typing indicator
     * disappears for other participants without waiting for the expiry window.
     */
    void clearAllTypingForUser(UUID userId);

    Set<UUID> listTypingUserIds(UUID chatId, Instant threshold);

    void purgeExpiredEntries(Instant threshold);
}
