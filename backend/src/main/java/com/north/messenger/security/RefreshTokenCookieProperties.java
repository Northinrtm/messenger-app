package com.north.messenger.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth.refresh-cookie")
public record RefreshTokenCookieProperties(
        String name,
        String path,
        String sameSite,
        boolean secure
) {
    public RefreshTokenCookieProperties {
        if (name == null || name.isBlank()) {
            throw new IllegalStateException("app.auth.refresh-cookie.name must be configured");
        }
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("app.auth.refresh-cookie.path must be configured");
        }
        if (sameSite == null || sameSite.isBlank()) {
            throw new IllegalStateException("app.auth.refresh-cookie.same-site must be configured");
        }
    }
}
