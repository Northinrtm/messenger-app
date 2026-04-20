package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AuthEndpointProtectionFilter extends OncePerRequestFilter {

    private static final Set<String> PROTECTED_AUTH_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/email-verification/confirm",
            "/api/auth/email-verification/resend",
            "/api/auth/password-reset/request",
            "/api/auth/password-reset/confirm",
            "/api/auth/refresh",
            "/api/auth/logout"
    );
    private static final Set<String> COOKIE_AUTH_PATHS = Set.of(
            "/api/auth/refresh",
            "/api/auth/logout"
    );
    private static final Set<String> ALLOWED_FETCH_SITES = Set.of("same-origin", "same-site", "none");

    private final ObjectMapper objectMapper;
    private final CorsConfiguration corsConfiguration = new CorsConfiguration();
    private final ConcurrentMap<String, RateLimitBucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong requestCounter = new AtomicLong();
    private final Map<String, RateLimitPolicy> policiesByPath = Map.of(
            "/api/auth/login", new RateLimitPolicy(20, Duration.ofMinutes(1)),
            "/api/auth/register", new RateLimitPolicy(10, Duration.ofMinutes(10)),
            "/api/auth/email-verification/confirm", new RateLimitPolicy(20, Duration.ofMinutes(10)),
            "/api/auth/email-verification/resend", new RateLimitPolicy(5, Duration.ofMinutes(30)),
            "/api/auth/password-reset/request", new RateLimitPolicy(5, Duration.ofMinutes(30)),
            "/api/auth/password-reset/confirm", new RateLimitPolicy(10, Duration.ofMinutes(10)),
            "/api/auth/refresh", new RateLimitPolicy(60, Duration.ofMinutes(1)),
            "/api/auth/logout", new RateLimitPolicy(30, Duration.ofMinutes(1))
    );

    public AuthEndpointProtectionFilter(
            ObjectMapper objectMapper,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String[] allowedOrigins
    ) {
        this.objectMapper = objectMapper;
        corsConfiguration.setAllowedOriginPatterns(Arrays.asList(allowedOrigins));
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod()) || !PROTECTED_AUTH_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (!isSameSiteRequest(request)) {
            writeError(
                    response,
                    request,
                    HttpStatus.FORBIDDEN,
                    "Cross-site authentication request blocked",
                    List.of("Use the first-party web client from an allowed origin")
            );
            return;
        }

        RateLimitPolicy policy = policiesByPath.get(request.getRequestURI());
        if (policy != null) {
            long now = System.currentTimeMillis();
            RateLimitDecision decision = acquire(request.getRequestURI(), resolveClientAddress(request), policy, now);
            if (!decision.allowed()) {
                response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(Math.max(1L, decision.retryAfterSeconds())));
                writeError(
                        response,
                        request,
                        HttpStatus.TOO_MANY_REQUESTS,
                        "Too many authentication requests",
                        List.of("Retry later")
                );
                return;
            }

            if ((requestCounter.incrementAndGet() & 255L) == 0L) {
                cleanupExpiredBuckets(now);
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isSameSiteRequest(HttpServletRequest request) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (StringUtils.hasText(origin)) {
            return isAllowedOrigin(origin);
        }

        String referer = request.getHeader(HttpHeaders.REFERER);
        if (StringUtils.hasText(referer)) {
            return extractOrigin(referer)
                    .map(this::isAllowedOrigin)
                    .orElse(false);
        }

        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (StringUtils.hasText(fetchSite)) {
            return ALLOWED_FETCH_SITES.contains(fetchSite.trim().toLowerCase(Locale.ROOT));
        }

        return !COOKIE_AUTH_PATHS.contains(request.getRequestURI());
    }

    private boolean isAllowedOrigin(String origin) {
        return corsConfiguration.checkOrigin(origin) != null;
    }

    private java.util.Optional<String> extractOrigin(String referer) {
        try {
            URI uri = URI.create(referer);
            if (uri.getScheme() == null || uri.getHost() == null) {
                return java.util.Optional.empty();
            }

            String origin = uri.getScheme() + "://" + uri.getHost();
            if (uri.getPort() >= 0) {
                origin += ":" + uri.getPort();
            }
            return java.util.Optional.of(origin);
        } catch (RuntimeException exception) {
            return java.util.Optional.empty();
        }
    }

    private String resolveClientAddress(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return forwardedFor.split(",", 2)[0].trim();
        }

        return request.getRemoteAddr();
    }

    private RateLimitDecision acquire(String path, String clientAddress, RateLimitPolicy policy, long now) {
        String bucketKey = path + ":" + clientAddress;
        RateLimitBucket bucket = buckets.computeIfAbsent(bucketKey, ignored -> new RateLimitBucket(now));
        synchronized (bucket) {
            if (now - bucket.windowStartedAt >= policy.window().toMillis()) {
                bucket.windowStartedAt = now;
                bucket.count = 0;
            }

            if (bucket.count >= policy.limit()) {
                long remainingMillis = policy.window().toMillis() - (now - bucket.windowStartedAt);
                return new RateLimitDecision(false, Duration.ofMillis(Math.max(remainingMillis, 1L)).toSeconds());
            }

            bucket.count += 1;
            return new RateLimitDecision(true, 0);
        }
    }

    private void cleanupExpiredBuckets(long now) {
        buckets.entrySet().removeIf((entry) -> {
            RateLimitPolicy policy = policiesByPath.get(extractPath(entry.getKey()));
            if (policy == null) {
                return true;
            }

            RateLimitBucket bucket = entry.getValue();
            synchronized (bucket) {
                return now - bucket.windowStartedAt >= policy.window().toMillis();
            }
        });
    }

    private String extractPath(String bucketKey) {
        int separatorIndex = bucketKey.indexOf(':');
        return separatorIndex >= 0 ? bucketKey.substring(0, separatorIndex) : bucketKey;
    }

    private void writeError(
            HttpServletResponse response,
            HttpServletRequest request,
            HttpStatus status,
            String message,
            List<String> details
    ) throws IOException {
        ApiError error = new ApiError(
                Instant.now(),
                status.value(),
                message,
                request.getRequestURI(),
                details
        );

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), error);
    }

    private record RateLimitPolicy(
            int limit,
            Duration window
    ) {
    }

    private record RateLimitDecision(
            boolean allowed,
            long retryAfterSeconds
    ) {
    }

    private static final class RateLimitBucket {
        private long windowStartedAt;
        private int count;

        private RateLimitBucket(long windowStartedAt) {
            this.windowStartedAt = windowStartedAt;
            this.count = 0;
        }
    }
}
