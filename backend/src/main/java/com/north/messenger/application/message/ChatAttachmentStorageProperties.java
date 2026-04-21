package com.north.messenger.application.message;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.media.message-attachments")
public record ChatAttachmentStorageProperties(
        Path directory,
        long maxSizeBytes
) {
}
