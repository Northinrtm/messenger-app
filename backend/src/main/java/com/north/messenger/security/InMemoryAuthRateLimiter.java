package com.north.messenger.security;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.auth.rate-limit.redis.enabled", havingValue = "false", matchIfMissing = true)
public class InMemoryAuthRateLimiter implements AuthRateLimiter {

    private final ConcurrentMap<String, RateLimitBucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong requestCounter = new AtomicLong();

    @Override
    public AuthRateLimitDecision acquire(
            String path,
            String clientAddress,
            AuthRateLimitPolicy policy,
            long nowEpochMillis
    ) {
        String bucketKey = path + ":" + clientAddress;
        long windowMillis = policy.window().toMillis();
        RateLimitBucket bucket = buckets.computeIfAbsent(bucketKey, ignored -> new RateLimitBucket(nowEpochMillis, windowMillis));
        synchronized (bucket) {
            bucket.windowMillis = windowMillis;
            if (nowEpochMillis - bucket.windowStartedAt >= windowMillis) {
                bucket.windowStartedAt = nowEpochMillis;
                bucket.count = 0;
            }

            if (bucket.count >= policy.limit()) {
                long remainingMillis = windowMillis - (nowEpochMillis - bucket.windowStartedAt);
                return new AuthRateLimitDecision(false, Duration.ofMillis(Math.max(remainingMillis, 1L)).toSeconds());
            }

            bucket.count += 1;
        }

        if ((requestCounter.incrementAndGet() & 255L) == 0L) {
            cleanupExpiredBuckets(nowEpochMillis);
        }

        return new AuthRateLimitDecision(true, 0);
    }

    private void cleanupExpiredBuckets(long nowEpochMillis) {
        buckets.entrySet().removeIf((entry) -> {
            RateLimitBucket bucket = entry.getValue();
            synchronized (bucket) {
                return nowEpochMillis - bucket.windowStartedAt >= bucket.windowMillis;
            }
        });
    }

    private static final class RateLimitBucket {
        private long windowStartedAt;
        private long windowMillis;
        private int count;

        private RateLimitBucket(long windowStartedAt, long windowMillis) {
            this.windowStartedAt = windowStartedAt;
            this.windowMillis = windowMillis;
            this.count = 0;
        }
    }
}
