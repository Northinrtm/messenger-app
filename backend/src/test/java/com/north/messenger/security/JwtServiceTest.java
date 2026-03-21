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

        String token = jwtService.createAccessToken(user);

        assertThat(jwtService.extractUsername(token)).isEqualTo("north");
        assertThat(jwtService.isTokenValid(token, "north")).isTrue();
    }
}
