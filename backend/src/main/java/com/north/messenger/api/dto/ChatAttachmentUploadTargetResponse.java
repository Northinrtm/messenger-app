package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ChatAttachmentUploadTargetResponse(
        UUID id,
        String fileName,
        String mimeType,
        long sizeBytes,
        Instant createdAt,
        String uploadUrl,
        String uploadMethod,
        Map<String, String> uploadHeaders,
        Instant expiresAt
) {
}
