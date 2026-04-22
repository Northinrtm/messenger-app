package com.north.messenger.security;

public record AuthRateLimitDecision(
        boolean allowed,
        long retryAfterSeconds
) {
}
