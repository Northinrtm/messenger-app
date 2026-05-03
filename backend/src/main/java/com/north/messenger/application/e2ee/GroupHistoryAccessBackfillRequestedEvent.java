package com.north.messenger.application.e2ee;

import java.util.Set;
import java.util.UUID;

public record GroupHistoryAccessBackfillRequestedEvent(
        UUID chatId,
        Set<UUID> recipientUserIds,
        UUID primaryGrantorUserId
) {
}
