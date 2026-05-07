package com.north.messenger.application.message;

import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public interface ChatAttachmentStorage {

    void deleteQuietly(String storageKey);

    boolean exists(String storageKey);

    DirectUploadTarget createDirectUpload(
            UUID attachmentId,
            String fileName,
            String mimeType,
            long sizeBytes
    );

    DirectDownloadTarget createDirectDownload(
            String storageKey,
            String fileName,
            String mimeType
    );

    record DirectUploadTarget(
            String storageKey,
            URI url,
            String method,
            Map<String, String> headers,
            Instant expiresAt
    ) {
    }

    record DirectDownloadTarget(
            URI url,
            Instant expiresAt
    ) {
    }
}
