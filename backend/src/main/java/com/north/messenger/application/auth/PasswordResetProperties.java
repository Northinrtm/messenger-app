package com.north.messenger.application.auth;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth.password-reset")
public record PasswordResetProperties(
        boolean enabled,
        Duration tokenTtl,
        String urlBase,
        String fromAddress
) {
    public PasswordResetProperties {
        if (tokenTtl == null || tokenTtl.isZero() || tokenTtl.isNegative()) {
            throw new IllegalStateException("app.auth.password-reset.token-ttl must be greater than zero");
        }
        if (enabled) {
            if (urlBase == null || urlBase.isBlank()) {
                throw new IllegalStateException("app.auth.password-reset.url-base must be configured when password reset is enabled");
            }
            if (fromAddress == null || fromAddress.isBlank()) {
                throw new IllegalStateException("app.auth.password-reset.from-address must be configured when password reset is enabled");
            }
            URI uri;
            try {
                uri = URI.create(urlBase);
            } catch (RuntimeException exception) {
                throw new IllegalStateException("app.auth.password-reset.url-base must be a valid absolute URL", exception);
            }
            if (uri.getScheme() == null || uri.getHost() == null) {
                throw new IllegalStateException("app.auth.password-reset.url-base must be a valid absolute URL");
            }
        }
    }
}
