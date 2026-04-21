package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record ChatAttachmentUploadResponse(
        UUID id,
        long ciphertextSizeBytes,
        Instant createdAt
) {
}
