package com.north.messenger.application.e2ee;

import java.util.UUID;

public record GroupHistoryKeyRotationRequestedEvent(
        UUID chatId,
        UUID primaryGrantorUserId
) {
}
