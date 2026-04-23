package com.north.messenger.application.message;

import java.util.List;
import java.util.UUID;

public record MessageDeletionBroadcastEvent(
        UUID chatId,
        UUID messageId,
        List<String> usernames
) {
}
