package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-user rate limiting for API endpoints that mutate data or are expensive.
 * Runs after {@link JwtAuthenticationFilter} so the security context is populated
 * and limits are keyed on the authenticated user ID, not the client IP.
 *
 * <p>Adding a new protected route: append a {@link ProtectedRoute} to {@code ROUTES}.
 * The {@link AuthRateLimiter} implementation is shared with auth-endpoint protection
 * and is either in-memory or Redis-backed depending on configuration.
 */
@Component
public class ApiRateLimitFilter extends OncePerRequestFilter {

    private record ProtectedRoute(String method, String pattern, AuthRateLimitPolicy policy) {
        boolean matches(String reqMethod, String reqPath, AntPathMatcher matcher) {
            return method.equalsIgnoreCase(reqMethod) && matcher.match(pattern, reqPath);
        }
    }

    private static final List<ProtectedRoute> ROUTES = List.of(
            new ProtectedRoute("POST", "/api/chats/*/messages",
                    new AuthRateLimitPolicy(60, Duration.ofMinutes(1))),
            new ProtectedRoute("PUT", "/api/chats/*/messages/*/reactions",
                    new AuthRateLimitPolicy(60, Duration.ofMinutes(1))),
            new ProtectedRoute("GET", "/api/search",
                    new AuthRateLimitPolicy(30, Duration.ofMinutes(1))),
            new ProtectedRoute("POST", "/api/chats/direct",
                    new AuthRateLimitPolicy(15, Duration.ofMinutes(1))),
            new ProtectedRoute("POST", "/api/chats/group",
                    new AuthRateLimitPolicy(5, Duration.ofMinutes(1))),
            new ProtectedRoute("POST", "/api/chats/*/participants",
                    new AuthRateLimitPolicy(10, Duration.ofMinutes(1))),
            new ProtectedRoute("PUT", "/api/chats/*",
                    new AuthRateLimitPolicy(10, Duration.ofMinutes(1))),
            new ProtectedRoute("POST", "/api/chats/*/attachments/initiate",
                    new AuthRateLimitPolicy(30, Duration.ofMinutes(1)))
    );

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final AuthRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;

    public ApiRateLimitFilter(AuthRateLimiter rateLimiter, ObjectMapper objectMapper) {
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        return ROUTES.stream().noneMatch(r -> r.matches(method, path, pathMatcher));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || "anonymousUser".equals(String.valueOf(auth.getPrincipal()))) {
            // Unauthenticated requests are rejected by Spring Security's authorization
            // rules before they reach the controller; skip rate limiting here.
            chain.doFilter(request, response);
            return;
        }

        String userId = auth.getName();
        String path = request.getRequestURI();
        String method = request.getMethod();

        AuthRateLimitPolicy policy = ROUTES.stream()
                .filter(r -> r.matches(method, path, pathMatcher))
                .map(ProtectedRoute::policy)
                .findFirst()
                .orElse(null);

        if (policy == null) {
            chain.doFilter(request, response);
            return;
        }

        long now = System.currentTimeMillis();
        AuthRateLimitDecision decision = rateLimiter.acquire(path, userId, policy, now);
        if (!decision.allowed()) {
            long retryAfter = Math.max(1L, decision.retryAfterSeconds());
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfter));
            ApiError error = new ApiError(
                    Instant.now(),
                    HttpStatus.TOO_MANY_REQUESTS.value(),
                    "Too many requests",
                    path,
                    List.of("Retry after " + retryAfter + " seconds")
            );
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getWriter(), error);
            return;
        }

        chain.doFilter(request, response);
    }
}
