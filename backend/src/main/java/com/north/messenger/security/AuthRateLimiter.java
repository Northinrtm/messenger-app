package com.north.messenger.security;

public interface AuthRateLimiter {

    AuthRateLimitDecision acquire(
            String path,
            String clientAddress,
            AuthRateLimitPolicy policy,
            long nowEpochMillis
    );
}
