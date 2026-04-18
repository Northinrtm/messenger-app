package com.north.messenger.security;

import com.north.messenger.domain.model.UserAccount;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    @Test
    void shouldCreateAndReadBackJwtSubject() {
        JwtProperties properties = new JwtProperties(
                "bWVzc2VuZ2VyLWFwcC1kZW1vLXNlY3JldC1rZXktZm9yLWxvY2FsLWRldmVsb3BtZW50LXRoaXMtbXVzdC1iZS1yZXBsYWNlZA==",
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger",
                "north-messenger-clients",
                false
        );
        JwtService jwtService = new JwtService(properties);

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hashed-password",
                Instant.now()
        );
        UUID sessionId = UUID.randomUUID();

        String token = jwtService.createAccessToken(user, sessionId);

        assertThat(jwtService.extractUsername(token)).isEqualTo("north");
        assertThat(jwtService.extractUserId(token)).isEqualTo(user.getId());
        assertThat(jwtService.extractSessionId(token)).isEqualTo(sessionId);
        assertThat(jwtService.isTokenValid(token, "north")).isTrue();
    }

    @Test
    void shouldGenerateEphemeralSigningKeyWhenEnabled() {
        JwtProperties properties = new JwtProperties(
                "",
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger",
                "north-messenger-clients",
                true
        );
        JwtService jwtService = new JwtService(properties);

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hashed-password",
                Instant.now()
        );
        UUID sessionId = UUID.randomUUID();

        String token = jwtService.createAccessToken(user, sessionId);

        assertThat(jwtService.extractUsername(token)).isEqualTo("north");
        assertThat(jwtService.extractUserId(token)).isEqualTo(user.getId());
        assertThat(jwtService.extractSessionId(token)).isEqualTo(sessionId);
    }

    @Test
    void shouldRejectTokenWithUnexpectedIssuer() {
        String secret = "bWVzc2VuZ2VyLWFwcC1kZW1vLXNlY3JldC1rZXktZm9yLWxvY2FsLWRldmVsb3BtZW50LXRoaXMtbXVzdC1iZS1yZXBsYWNlZA==";
        JwtService trustedJwtService = new JwtService(new JwtProperties(
                secret,
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger",
                "north-messenger-clients",
                false
        ));
        JwtService foreignJwtService = new JwtService(new JwtProperties(
                secret,
                Duration.ofHours(12),
                Duration.ofDays(30),
                "foreign-messenger",
                "north-messenger-clients",
                false
        ));

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hashed-password",
                Instant.now()
        );
        UUID sessionId = UUID.randomUUID();
        String token = foreignJwtService.createAccessToken(user, sessionId);

        assertThatThrownBy(() -> trustedJwtService.readAccessToken(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void shouldRejectTokenWithUnexpectedAudience() {
        String secret = "bWVzc2VuZ2VyLWFwcC1kZW1vLXNlY3JldC1rZXktZm9yLWxvY2FsLWRldmVsb3BtZW50LXRoaXMtbXVzdC1iZS1yZXBsYWNlZA==";
        JwtService trustedJwtService = new JwtService(new JwtProperties(
                secret,
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger",
                "north-messenger-clients",
                false
        ));
        JwtService foreignAudienceJwtService = new JwtService(new JwtProperties(
                secret,
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger",
                "foreign-clients",
                false
        ));

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hashed-password",
                Instant.now()
        );
        UUID sessionId = UUID.randomUUID();
        String token = foreignAudienceJwtService.createAccessToken(user, sessionId);

        assertThatThrownBy(() -> trustedJwtService.readAccessToken(token))
                .isInstanceOf(RuntimeException.class);
    }
}
