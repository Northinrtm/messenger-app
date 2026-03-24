package com.north.messenger.api.dto;

import java.util.UUID;

public record MessageStatusEventResponse(
        UUID messageId,
        UUID chatId,
        MessageStatusResponse status
) {
}
