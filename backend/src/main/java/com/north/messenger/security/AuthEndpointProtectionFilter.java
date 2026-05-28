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
            "/api/auth/logout",
            "/api/mobile/auth/login",
            "/api/mobile/auth/register",
            "/api/mobile/auth/refresh",
            "/api/mobile/auth/logout"
    );
    private static final Set<String> COOKIE_AUTH_PATHS = Set.of(
            "/api/auth/refresh",
            "/api/auth/logout"
    );
    private static final Set<String> ALLOWED_FETCH_SITES = Set.of("same-origin", "same-site", "none");

    private final ObjectMapper objectMapper;
    private final AuthRateLimiter rateLimiter;
    private final CorsConfiguration corsConfiguration = new CorsConfiguration();
    private final Map<String, AuthRateLimitPolicy> policiesByPath = Map.ofEntries(
            Map.entry("/api/auth/login", new AuthRateLimitPolicy(20, Duration.ofMinutes(1))),
            Map.entry("/api/auth/register", new AuthRateLimitPolicy(10, Duration.ofMinutes(10))),
            Map.entry("/api/auth/email-verification/confirm", new AuthRateLimitPolicy(20, Duration.ofMinutes(10))),
            Map.entry("/api/auth/email-verification/resend", new AuthRateLimitPolicy(5, Duration.ofMinutes(30))),
            Map.entry("/api/auth/password-reset/request", new AuthRateLimitPolicy(5, Duration.ofMinutes(30))),
            Map.entry("/api/auth/password-reset/confirm", new AuthRateLimitPolicy(10, Duration.ofMinutes(10))),
            Map.entry("/api/auth/refresh", new AuthRateLimitPolicy(120, Duration.ofMinutes(1))),
            Map.entry("/api/auth/logout", new AuthRateLimitPolicy(30, Duration.ofMinutes(1))),
            Map.entry("/api/mobile/auth/login", new AuthRateLimitPolicy(20, Duration.ofMinutes(1))),
            Map.entry("/api/mobile/auth/register", new AuthRateLimitPolicy(10, Duration.ofMinutes(10))),
            Map.entry("/api/mobile/auth/refresh", new AuthRateLimitPolicy(60, Duration.ofMinutes(1))),
            Map.entry("/api/mobile/auth/logout", new AuthRateLimitPolicy(30, Duration.ofMinutes(1)))
    );

    public AuthEndpointProtectionFilter(
            ObjectMapper objectMapper,
            AuthRateLimiter rateLimiter,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String[] allowedOrigins
    ) {
        this.objectMapper = objectMapper;
        this.rateLimiter = rateLimiter;
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

        AuthRateLimitPolicy policy = policiesByPath.get(request.getRequestURI());
        if (policy != null) {
            long now = System.currentTimeMillis();
            AuthRateLimitDecision decision = rateLimiter.acquire(
                    request.getRequestURI(),
                    resolveClientAddress(request),
                    policy,
                    now
            );
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
}
