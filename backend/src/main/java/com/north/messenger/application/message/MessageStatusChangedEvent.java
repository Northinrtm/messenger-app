package com.north.messenger.application.message;

import java.util.List;
import java.util.UUID;

public record MessageStatusChangedEvent(
        UUID chatId,
        List<UUID> messageIds,
        boolean refreshChatSummary
) {
}
