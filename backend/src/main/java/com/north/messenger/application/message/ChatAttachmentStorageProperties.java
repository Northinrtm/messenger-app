package com.north.messenger.application.message;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.media.message-attachments")
public record ChatAttachmentStorageProperties(
        long maxSizeBytes,
        Duration orphanTtl,
        long orphanCleanupFixedDelayMs,
        MinioProperties minio
) {
    public record MinioProperties(
            URI endpoint,
            URI publicEndpoint,
            String accessKey,
            String secretKey,
            String bucket,
            String region,
            boolean pathStyleAccess,
            boolean autoCreateBucket,
            Duration presignedUrlTtl
    ) {
    }
}
