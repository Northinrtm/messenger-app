package com.north.messenger.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtPropertiesTest {

    private static final Duration ACCESS_TOKEN_TTL = Duration.ofHours(12);
    private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

    @Test
    void shouldRejectBlankSecret() {
        assertThatThrownBy(() -> new JwtProperties(
                " ",
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                "north-messenger",
                false
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.secret must be configured via APP_JWT_SECRET");
    }

    @Test
    void shouldRejectInvalidBase64Secret() {
        assertThatThrownBy(() -> new JwtProperties(
                "not-base64",
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                "north-messenger",
                false
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.secret must be a valid Base64-encoded key");
    }

    @Test
    void shouldRejectShortSecret() {
        String shortSecret = Base64.getEncoder().encodeToString("too-short".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> new JwtProperties(
                shortSecret,
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                "north-messenger",
                false
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.secret must decode to at least 32 bytes");
    }

    @Test
    void shouldAllowMissingSecretWhenGenerationIsEnabled() {
        new JwtProperties(
                "",
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                "north-messenger",
                true
        );
    }
}
