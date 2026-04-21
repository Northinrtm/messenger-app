package com.north.messenger.application.push;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.push")
public record PushNotificationProperties(
        boolean enabled,
        String subject,
        String vapidPublicKey,
        String vapidPrivateKey,
        Duration requestTimeout,
        Duration ttl
) {
}
