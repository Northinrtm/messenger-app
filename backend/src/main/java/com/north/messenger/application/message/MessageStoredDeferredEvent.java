package com.north.messenger.application.message;

import java.util.UUID;

public record MessageStoredDeferredEvent(
        UUID chatId,
        UUID messageId,
        String clientMessageId,
        UUID senderUserId
) {
}
