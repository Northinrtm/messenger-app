package com.north.messenger.application.message;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.e2ee.preview")
public record E2eePreviewProperties(
        boolean decryptServerSide
) {
}
