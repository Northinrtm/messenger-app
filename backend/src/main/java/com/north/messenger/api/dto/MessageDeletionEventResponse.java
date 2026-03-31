package com.north.messenger.api.dto;

import java.util.UUID;

public record MessageDeletionEventResponse(
        UUID messageId,
        UUID chatId
) {
}
