package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        UUID chatId,
        ParticipantResponse sender,
        Instant createdAt,
        MessageStatusResponse status,
        String clientMessageId,
        EncryptedMessagePayloadResponse encryptedPayload
) {
}

