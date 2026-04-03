package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ActuatorEndpointProtectionFilter extends OncePerRequestFilter {

    private static final String PROMETHEUS_ENDPOINT = "/actuator/prometheus";

    private final ObjectMapper objectMapper;
    private final String expectedUsername;
    private final String expectedPassword;

    public ActuatorEndpointProtectionFilter(
            ObjectMapper objectMapper,
            @Value("${app.actuator.scrape.username:prometheus}") String expectedUsername,
            @Value("${app.actuator.scrape.password:prometheus}") String expectedPassword
    ) {
        this.objectMapper = objectMapper;
        this.expectedUsername = expectedUsername;
        this.expectedPassword = expectedPassword;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PROMETHEUS_ENDPOINT.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Credentials credentials = parseBasicAuth(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (!isAuthorized(credentials)) {
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"actuator\"");
            writeError(
                    response,
                    request,
                    HttpStatus.UNAUTHORIZED,
                    "Actuator scrape authentication required",
                    List.of("Provide valid internal Prometheus credentials")
            );
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Credentials parseBasicAuth(String authorizationHeader) {
        if (!StringUtils.hasText(authorizationHeader) || !authorizationHeader.startsWith("Basic ")) {
            return Credentials.EMPTY;
        }

        try {
            byte[] decoded = Base64.getDecoder().decode(authorizationHeader.substring(6));
            String token = new String(decoded, StandardCharsets.UTF_8);
            int separatorIndex = token.indexOf(':');
            if (separatorIndex < 0) {
                return Credentials.EMPTY;
            }

            return new Credentials(
                    token.substring(0, separatorIndex),
                    token.substring(separatorIndex + 1)
            );
        } catch (IllegalArgumentException exception) {
            return Credentials.EMPTY;
        }
    }

    private boolean isAuthorized(Credentials credentials) {
        if (!StringUtils.hasText(expectedUsername) || !StringUtils.hasText(expectedPassword)) {
            return false;
        }

        return constantTimeEquals(expectedUsername, credentials.username())
                && constantTimeEquals(expectedPassword, credentials.password());
    }

    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8)
        );
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

    private record Credentials(
            String username,
            String password
    ) {
        private static final Credentials EMPTY = new Credentials("", "");
    }
}
