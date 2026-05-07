package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record ChatAttachmentDownloadUrlResponse(
        UUID id,
        String fileName,
        String mimeType,
        String url,
        Instant expiresAt
) {
}
