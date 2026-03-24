package com.north.messenger.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth.refresh-cookie")
public record RefreshTokenCookieProperties(
        String name,
        String path,
        String sameSite,
        boolean secure
) {
}
