package com.north.messenger.application.call;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configures ICE servers handed to native call clients. STUN is always returned;
 * TURN (coturn) is enabled in production for the minority of calls behind strict
 * NAT. TURN credentials are ephemeral and computed from {@code secret} using the
 * coturn "use-auth-secret" (TURN REST API) scheme — no static passwords.
 */
@ConfigurationProperties(prefix = "app.turn")
public record TurnProperties(
        boolean enabled,
        String secret,
        List<String> urls,
        Duration credentialTtl,
        List<String> stunUrls
) {
    public TurnProperties {
        if (urls == null) {
            urls = List.of();
        }
        if (stunUrls == null || stunUrls.isEmpty()) {
            stunUrls = List.of(
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
            );
        }
        if (credentialTtl == null || credentialTtl.isZero() || credentialTtl.isNegative()) {
            credentialTtl = Duration.ofHours(1);
        }
    }
}
