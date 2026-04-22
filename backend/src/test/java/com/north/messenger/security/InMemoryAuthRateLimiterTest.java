package com.north.messenger.security;

import java.time.Duration;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryAuthRateLimiterTest {

    @Test
    void shouldLimitRequestsPerPathAndClientWithinWindow() {
        InMemoryAuthRateLimiter limiter = new InMemoryAuthRateLimiter();
        AuthRateLimitPolicy policy = new AuthRateLimitPolicy(2, Duration.ofMinutes(1));
        long now = 1_000L;

        assertThat(limiter.acquire("/api/auth/login", "203.0.113.10", policy, now).allowed()).isTrue();
        assertThat(limiter.acquire("/api/auth/login", "203.0.113.10", policy, now + 1).allowed()).isTrue();

        AuthRateLimitDecision rejected =
                limiter.acquire("/api/auth/login", "203.0.113.10", policy, now + 2);

        assertThat(rejected.allowed()).isFalse();
        assertThat(rejected.retryAfterSeconds()).isGreaterThan(0);
    }

    @Test
    void shouldResetAfterWindow() {
        InMemoryAuthRateLimiter limiter = new InMemoryAuthRateLimiter();
        AuthRateLimitPolicy policy = new AuthRateLimitPolicy(1, Duration.ofSeconds(10));
        long now = 1_000L;

        assertThat(limiter.acquire("/api/auth/login", "203.0.113.10", policy, now).allowed()).isTrue();
        assertThat(limiter.acquire("/api/auth/login", "203.0.113.10", policy, now + 1).allowed()).isFalse();
        assertThat(limiter.acquire("/api/auth/login", "203.0.113.10", policy, now + 10_001).allowed()).isTrue();
    }
}
