package com.north.messenger.application.chat;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.media.conference-recordings")
public record ConferenceRecordingStorageProperties(
        Path directory,
        Path importDirectory
) {
}
