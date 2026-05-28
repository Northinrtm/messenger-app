package com.north.messenger.application.chat;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.jitsi.jwt")
public record JitsiJwtProperties(
        boolean enabled,
        String appId,
        String appSecret,
        String domain,
        Duration tokenTtl
) {
    public JitsiJwtProperties {
        if (enabled) {
            if (appId == null || appId.isBlank()) {
                throw new IllegalStateException("app.jitsi.jwt.app-id must be configured when Jitsi JWT is enabled");
            }
            if (appSecret == null || appSecret.isBlank()) {
                throw new IllegalStateException("app.jitsi.jwt.app-secret must be configured when Jitsi JWT is enabled");
            }
            if (domain == null || domain.isBlank()) {
                throw new IllegalStateException("app.jitsi.jwt.domain must be configured when Jitsi JWT is enabled");
            }
        }
        if (tokenTtl == null || tokenTtl.isNegative() || tokenTtl.isZero()) {
            tokenTtl = Duration.ofHours(1);
        }
    }
}
