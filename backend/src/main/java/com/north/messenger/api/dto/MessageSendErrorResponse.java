package com.north.messenger.api.dto;

import java.util.List;
import java.util.UUID;

public record MessageSendErrorResponse(
        UUID chatId,
        String clientMessageId,
        int status,
        String error,
        List<String> details
) {
}
