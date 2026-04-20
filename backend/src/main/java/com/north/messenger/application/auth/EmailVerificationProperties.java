package com.north.messenger.application.auth;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth.email-verification")
public record EmailVerificationProperties(
        boolean enabled,
        Duration tokenTtl,
        String urlBase,
        String fromAddress
) {
    public EmailVerificationProperties {
        if (tokenTtl == null || tokenTtl.isZero() || tokenTtl.isNegative()) {
            throw new IllegalStateException("app.auth.email-verification.token-ttl must be greater than zero");
        }
        if (enabled) {
            if (urlBase == null || urlBase.isBlank()) {
                throw new IllegalStateException("app.auth.email-verification.url-base must be configured when email verification is enabled");
            }
            if (fromAddress == null || fromAddress.isBlank()) {
                throw new IllegalStateException("app.auth.email-verification.from-address must be configured when email verification is enabled");
            }
            URI uri;
            try {
                uri = URI.create(urlBase);
            } catch (RuntimeException exception) {
                throw new IllegalStateException("app.auth.email-verification.url-base must be a valid absolute URL", exception);
            }
            if (uri.getScheme() == null || uri.getHost() == null) {
                throw new IllegalStateException("app.auth.email-verification.url-base must be a valid absolute URL");
            }
        }
    }
}
