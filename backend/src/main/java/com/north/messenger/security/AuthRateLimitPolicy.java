package com.north.messenger.security;

import java.time.Duration;

public record AuthRateLimitPolicy(
        int limit,
        Duration window
) {
    public AuthRateLimitPolicy {
        if (limit <= 0) {
            throw new IllegalArgumentException("Rate limit must be positive");
        }
        if (window == null || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("Rate limit window must be positive");
        }
    }
}
