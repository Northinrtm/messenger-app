package com.north.messenger.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class RefreshTokenCookieService {

    private final RefreshTokenCookieProperties properties;
    private final JwtProperties jwtProperties;

    public RefreshTokenCookieService(
            RefreshTokenCookieProperties properties,
            JwtProperties jwtProperties
    ) {
        this.properties = properties;
        this.jwtProperties = jwtProperties;
    }

    public Optional<String> extract(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null || cookies.length == 0) {
            return Optional.empty();
        }

        return Arrays.stream(cookies)
                .filter(cookie -> properties.name().equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    public void write(HttpServletResponse response, String refreshToken) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(refreshToken, jwtProperties.refreshTokenTtl()).toString());
    }

    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie("", Duration.ZERO).toString());
    }

    public String cookieName() {
        return properties.name();
    }

    private ResponseCookie buildCookie(String value, Duration maxAge) {
        return ResponseCookie.from(properties.name(), value)
                .httpOnly(true)
                .secure(properties.secure())
                .sameSite(properties.sameSite())
                .path(properties.path())
                .maxAge(maxAge)
                .build();
    }
}
