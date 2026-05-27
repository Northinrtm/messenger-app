package com.north.messenger.application.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.push.fcm")
public record FcmProperties(
        boolean enabled,
        String serviceAccountJson
) {
}
