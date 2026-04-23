package com.north.messenger.application.message;

import java.util.UUID;

public record MessageReactionChangedEvent(
        UUID chatId,
        UUID messageId
) {
}
