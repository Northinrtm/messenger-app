package com.north.messenger.security;

import io.jsonwebtoken.io.Decoders;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        String secret,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        String issuer,
        boolean generateSecretIfMissing
) {
    private static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if ((secret == null || secret.isBlank()) && !generateSecretIfMissing) {
            throw new IllegalStateException("app.jwt.secret must be configured via APP_JWT_SECRET");
        }
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException("app.jwt.issuer must not be blank");
        }
        if (accessTokenTtl == null || accessTokenTtl.isZero() || accessTokenTtl.isNegative()) {
            throw new IllegalStateException("app.jwt.access-token-ttl must be greater than zero");
        }
        if (refreshTokenTtl == null || refreshTokenTtl.isZero() || refreshTokenTtl.isNegative()) {
            throw new IllegalStateException("app.jwt.refresh-token-ttl must be greater than zero");
        }
        if (secret != null && !secret.isBlank()) {
            byte[] decodedSecret;
            try {
                decodedSecret = Decoders.BASE64.decode(secret);
            } catch (RuntimeException exception) {
                throw new IllegalStateException("app.jwt.secret must be a valid Base64-encoded key", exception);
            }

            if (decodedSecret.length < MIN_SECRET_BYTES) {
                throw new IllegalStateException("app.jwt.secret must decode to at least 32 bytes");
            }
        }
    }
}
