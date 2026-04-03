package com.north.messenger.application.message;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public interface TypingStateStore {

    void markTyping(UUID chatId, UUID userId, Instant at);

    void clearTyping(UUID chatId, UUID userId);

    Set<UUID> listTypingUserIds(UUID chatId, Instant threshold);

    void purgeExpiredEntries(Instant threshold);
}
