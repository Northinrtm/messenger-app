package com.north.messenger.application.message;

import java.util.UUID;

public record MessageDispatchEvent(
        UUID chatId,
        UUID messageId,
        String clientMessageId,
        MessageDispatchMode mode
) {
}
