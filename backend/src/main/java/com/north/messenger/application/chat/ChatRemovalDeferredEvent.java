package com.north.messenger.application.chat;

import java.util.List;
import java.util.UUID;

public record ChatRemovalDeferredEvent(
        UUID chatId,
        List<String> usernames
) {
}
