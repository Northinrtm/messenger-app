package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.AuthController;
import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.security.RefreshTokenCookieService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, AuthEndpointProtectionFilter.class})
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @MockitoBean
    private RefreshTokenCookieService refreshTokenCookieService;

    @Test
    void shouldRejectAnonymousAccessToAuthenticatedAuthEndpoints() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldAllowAnonymousLogin() throws Exception {
        when(authService.login(any(LoginRequest.class), any())).thenReturn(new AuthService.IssuedAuthSession(
                new AuthResponse(
                        "access-token",
                        Instant.parse("2026-03-22T12:00:00Z"),
                        UUID.randomUUID(),
                        new UserProfileResponse(
                                UUID.randomUUID(),
                                "north",
                                "North",
                                Instant.parse("2026-03-20T12:00:00Z"),
                                null,
                                true
                        )
                ),
                "session.secret"
        ));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                .andExpect(status().isOk());

        verify(refreshTokenCookieService).write(any(), any());
    }

    @Test
    void shouldRejectCrossSiteLoginRequests() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", "https://evil.example")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void shouldRateLimitRepeatedLoginAttemptsFromSameClient() throws Exception {
        when(authService.login(any(LoginRequest.class), any())).thenReturn(new AuthService.IssuedAuthSession(
                new AuthResponse(
                        "access-token",
                        Instant.parse("2026-03-22T12:00:00Z"),
                        UUID.randomUUID(),
                        new UserProfileResponse(
                                UUID.randomUUID(),
                                "north",
                                "North",
                                Instant.parse("2026-03-20T12:00:00Z"),
                                null,
                                true
                        )
                ),
                "session.secret"
        ));

        for (int attempt = 0; attempt < 20; attempt += 1) {
            mockMvc.perform(post("/api/auth/login")
                            .header("Origin", "http://localhost:5173")
                            .header("X-Forwarded-For", "203.0.113.10")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", "http://localhost:5173")
                        .header("X-Forwarded-For", "203.0.113.10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                .andExpect(status().isTooManyRequests());
    }
}
