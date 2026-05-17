package com.north.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.MobileAuthController;
import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.MobileRefreshTokenRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MobileAuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        AuthEndpointProtectionFilter.class,
        InMemoryAuthRateLimiter.class,
        ActuatorEndpointProtectionFilter.class
})
class MobileAuthControllerSecurityTest {

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

    @Test
    void shouldAllowAnonymousMobileRegistrationAndReturnRefreshToken() throws Exception {
        when(authService.register(any(RegisterRequest.class), any()))
                .thenReturn(issuedAuthSession("mobile-register-refresh"));

        mockMvc.perform(post("/api/mobile/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "north",
                                "north@example.com",
                                "North",
                                "riverlantern"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("access-token"))
                .andExpect(jsonPath("$.refreshToken").value("mobile-register-refresh"));
    }

    @Test
    void shouldAllowAnonymousMobileLoginWithoutOriginHeader() throws Exception {
        when(authService.login(any(LoginRequest.class), any()))
                .thenReturn(issuedAuthSession("mobile-login-refresh"));

        mockMvc.perform(post("/api/mobile/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("access-token"))
                .andExpect(jsonPath("$.refreshToken").value("mobile-login-refresh"));
    }

    @Test
    void shouldAllowMobileRefreshWithoutCookieHeaders() throws Exception {
        when(authService.refresh("session.secret"))
                .thenReturn(issuedAuthSession("next-mobile-refresh"));

        mockMvc.perform(post("/api/mobile/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new MobileRefreshTokenRequest("session.secret"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshToken").value("next-mobile-refresh"));
    }

    @Test
    void shouldAllowMobileLogoutWithoutCookieHeaders() throws Exception {
        mockMvc.perform(post("/api/mobile/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new MobileRefreshTokenRequest("session.secret"))))
                .andExpect(status().isNoContent());

        verify(authService).logout(eq("session.secret"));
    }

    @Test
    void shouldRejectCrossSiteMobileLoginRequests() throws Exception {
        mockMvc.perform(post("/api/mobile/auth/login")
                        .header("Origin", "https://evil.example")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("north", "password"))))
                .andExpect(status().isForbidden());
    }

    private AuthService.IssuedAuthSession issuedAuthSession(String refreshToken) {
        return new AuthService.IssuedAuthSession(
                new AuthResponse(
                        "access-token",
                        Instant.parse("2026-03-22T12:00:00Z"),
                        UUID.fromString("11111111-1111-1111-1111-111111111111"),
                        new UserProfileResponse(
                                UUID.fromString("22222222-2222-2222-2222-222222222222"),
                                "north",
                                "North",
                                null,
                                Instant.parse("2026-03-20T12:00:00Z"),
                                null,
                                true,
                                "north@example.com",
                                false,
                                true,
                                false,
                                1L
                        )
                ),
                refreshToken
        );
    }
}
