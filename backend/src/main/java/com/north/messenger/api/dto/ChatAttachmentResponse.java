package com.north.messenger.api.dto;

import java.util.UUID;

public record ChatAttachmentResponse(
        UUID id,
        String fileName,
        String mimeType,
        long sizeBytes
) {
}
