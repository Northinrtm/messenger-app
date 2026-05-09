package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.AuthController;
import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.EmailVerificationConfirmRequest;
import com.north.messenger.api.dto.EmailVerificationResendRequest;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.PasswordResetRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.auth.EmailVerificationService;
import com.north.messenger.application.auth.PasswordResetService;
import com.north.messenger.application.auth.UserMailboxService;
import com.north.messenger.security.RefreshTokenCookieService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        AuthEndpointProtectionFilter.class,
        InMemoryAuthRateLimiter.class,
        ActuatorEndpointProtectionFilter.class
})
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

    @MockitoBean
    private PasswordResetService passwordResetService;

    @MockitoBean
    private EmailVerificationService emailVerificationService;

    @MockitoBean
    private UserMailboxService userMailboxService;

    @Test
    void shouldRejectAnonymousAccessToAuthenticatedAuthEndpoints() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldAllowAnonymousOpenApiJson() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isNotFound());
    }

    @Test
    void shouldAllowAnonymousSwaggerUiHtml() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().isNotFound());
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
    void shouldAllowAnonymousRegistrationAndIssueSession() throws Exception {
        when(authService.register(any(RegisterRequest.class), any())).thenReturn(new AuthService.IssuedAuthSession(
                new AuthResponse(
                        "access-token",
                        Instant.parse("2026-03-22T12:00:00Z"),
                        UUID.randomUUID(),
                        new UserProfileResponse(
                                UUID.randomUUID(),
                                "north",
                                "North",
                                null,
                                Instant.parse("2026-03-20T12:00:00Z"),
                                null,
                                true,
                                "north@example.com",
                                false,
                                true,
                                1L
                        )
                ),
                "session.secret"
        ));

        mockMvc.perform(post("/api/auth/register")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "north",
                                "north@example.com",
                                "North",
                                "riverlantern"
                        ))))
                .andExpect(status().isOk());

        verify(refreshTokenCookieService).write(any(), any());
    }

    @Test
    void shouldAcceptCanonicalDisplayNameFieldOnRegistrationPayload() throws Exception {
        when(authService.register(any(RegisterRequest.class), any())).thenReturn(new AuthService.IssuedAuthSession(
                new AuthResponse(
                        "access-token",
                        Instant.parse("2026-03-22T12:00:00Z"),
                        UUID.randomUUID(),
                        new UserProfileResponse(
                                UUID.randomUUID(),
                                "north",
                                "North",
                                null,
                                Instant.parse("2026-03-20T12:00:00Z"),
                                null,
                                true,
                                "north@example.com",
                                false,
                                true,
                                1L
                        )
                ),
                "session.secret"
        ));

        mockMvc.perform(post("/api/auth/register")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "north",
                                  "email": "north@example.com",
                                  "displayName": "North",
                                  "password": "riverlantern"
                                }
                                """))
                .andExpect(status().isOk());

        verify(authService).register(argThat(request -> "North".equals(request.displayName())), any());
        verify(refreshTokenCookieService).write(any(), any());
    }

    @Test
    void shouldRequireDisplayNameOnRegistrationUsingCanonicalFieldName() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "north",
                                  "email": "north@example.com",
                                  "password": "riverlantern"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(result -> {
                    String responseBody = result.getResponse().getContentAsString();
                    assertThat(responseBody).contains("displayName");
                    assertThat(responseBody).doesNotContain("\"name\"");
                });

        verify(authService, never()).register(any(RegisterRequest.class), any());
    }

    @Test
    void shouldRejectMalformedRegistrationPayloadBeforeCreatingSession() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "----",
                                  "email": "????????????@mail.ru",
                                  "displayName": "&&&&&&&&&&",
                                  "password": "20260422"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(result -> {
                    String responseBody = result.getResponse().getContentAsString();
                    assertThat(responseBody).contains("username");
                    assertThat(responseBody).contains("email");
                    assertThat(responseBody).contains("displayName");
                    assertThat(responseBody).contains("password");
                });

        verify(authService, never()).register(any(RegisterRequest.class), any());
        verify(refreshTokenCookieService, never()).write(any(), any());
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
    void shouldRequireEmailOnRegistration() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "north",
                                  "displayName": "North",
                                  "password": "riverlantern"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldAllowAnonymousPasswordResetRequests() throws Exception {
        mockMvc.perform(post("/api/auth/password-reset/request")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new PasswordResetRequest("north@example.com"))))
                .andExpect(status().isAccepted());
    }

    @Test
    void shouldAllowAnonymousEmailVerificationConfirmation() throws Exception {
        mockMvc.perform(post("/api/auth/email-verification/confirm")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new EmailVerificationConfirmRequest("verify-token"))))
                .andExpect(status().isNoContent());
    }

    @Test
    void shouldAllowAuthenticatedOwnEmailVerificationResend() throws Exception {
        when(jwtService.readAccessToken("access-token")).thenReturn(new JwtService.AccessTokenClaims(
                "north",
                UUID.randomUUID(),
                UUID.randomUUID(),
                Instant.now().plusSeconds(300)
        ));
        when(authService.authenticateAccessToken("access-token")).thenReturn(java.util.Optional.of(
                new AuthService.AuthenticatedSession(
                        com.north.messenger.support.TestUserAccounts.testUserAccount(
                                UUID.randomUUID(),
                                "north",
                                "north@example.com",
                                "North",
                                null,
                                null,
                                "password-hash",
                                Instant.now().minusSeconds(60),
                                null
                        ),
                        UUID.randomUUID()
                )
        ));

        mockMvc.perform(post("/api/auth/me/email-verification")
                        .header("Origin", "http://localhost:5173")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer access-token"))
                .andExpect(status().isAccepted());
    }

    @Test
    void shouldRateLimitRepeatedPasswordResetRequestsFromSameClient() throws Exception {
        for (int attempt = 0; attempt < 5; attempt += 1) {
            mockMvc.perform(post("/api/auth/password-reset/request")
                            .header("Origin", "http://localhost:5173")
                            .header("X-Forwarded-For", "203.0.113.20")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new PasswordResetRequest("north@example.com"))))
                    .andExpect(status().isAccepted());
        }

        mockMvc.perform(post("/api/auth/password-reset/request")
                        .header("Origin", "http://localhost:5173")
                        .header("X-Forwarded-For", "203.0.113.20")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new PasswordResetRequest("north@example.com"))))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void shouldRateLimitRepeatedEmailVerificationResendRequestsFromSameClient() throws Exception {
        for (int attempt = 0; attempt < 5; attempt += 1) {
            mockMvc.perform(post("/api/auth/email-verification/resend")
                            .header("Origin", "http://localhost:5173")
                            .header("X-Forwarded-For", "203.0.113.21")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new EmailVerificationResendRequest("north@example.com"))))
                    .andExpect(status().isAccepted());
        }

        mockMvc.perform(post("/api/auth/email-verification/resend")
                        .header("Origin", "http://localhost:5173")
                        .header("X-Forwarded-For", "203.0.113.21")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new EmailVerificationResendRequest("north@example.com"))))
                .andExpect(status().isTooManyRequests());
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

    @Test
    void shouldFailClosedForPrometheusWhenScrapeCredentialsAreMissing() throws Exception {
        mockMvc.perform(get("/actuator/prometheus")
                        .header(HttpHeaders.AUTHORIZATION, basicAuth("prometheus", "prometheus")))
                .andExpect(status().isUnauthorized());
    }

    private String basicAuth(String username, String password) {
        String token = username + ":" + password;
        return "Basic " + Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
    }
}
