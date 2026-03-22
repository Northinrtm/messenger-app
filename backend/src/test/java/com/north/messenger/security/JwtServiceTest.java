package com.north.messenger.security;

import com.north.messenger.domain.model.UserAccount;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    @Test
    void shouldCreateAndReadBackJwtSubject() {
        JwtProperties properties = new JwtProperties(
                "bWVzc2VuZ2VyLWFwcC1kZW1vLXNlY3JldC1rZXktZm9yLWxvY2FsLWRldmVsb3BtZW50LXRoaXMtbXVzdC1iZS1yZXBsYWNlZA==",
                Duration.ofHours(12),
                Duration.ofDays(30),
                "north-messenger"
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
}
