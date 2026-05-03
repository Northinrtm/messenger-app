package com.north.messenger.api.dto;

public record PendingOutgoingMessageAttachmentPayload(
        String id,
        String fileName,
        String mimeType,
        long sizeBytes,
        long ciphertextSizeBytes,
        String key,
        String iv
) {
}
