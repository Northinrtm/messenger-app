package com.north.messenger.application.e2ee;

import io.jsonwebtoken.io.Decoders;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.e2ee.escrow")
public record E2eeEscrowProperties(
        String secret,
        boolean generateSecretIfMissing
) {
    private static final int MIN_SECRET_BYTES = 32;

    public E2eeEscrowProperties {
        if ((secret == null || secret.isBlank()) && !generateSecretIfMissing) {
            throw new IllegalStateException("app.e2ee.escrow.secret must be configured via APP_E2EE_ESCROW_SECRET");
        }
        if (secret != null && !secret.isBlank()) {
            byte[] decodedSecret;
            try {
                decodedSecret = Decoders.BASE64.decode(secret);
            } catch (RuntimeException exception) {
                throw new IllegalStateException(
                        "app.e2ee.escrow.secret must be a valid Base64-encoded key",
                        exception
                );
            }
            if (decodedSecret.length < MIN_SECRET_BYTES) {
                throw new IllegalStateException("app.e2ee.escrow.secret must decode to at least 32 bytes");
            }
        }
    }
}
