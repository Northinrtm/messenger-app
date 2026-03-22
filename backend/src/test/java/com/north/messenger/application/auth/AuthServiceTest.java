package com.north.messenger.application.auth;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.RefreshTokenRequest;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import com.north.messenger.security.JwtService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthServiceTest {

    private UserAccountRepository userAccountRepository;
    private UserSessionRepository userSessionRepository;
    private PasswordEncoder passwordEncoder;
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        userAccountRepository = mock(UserAccountRepository.class);
        userSessionRepository = mock(UserSessionRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        jwtService = mock(JwtService.class);
        authService = new AuthService(userAccountRepository, userSessionRepository, passwordEncoder, jwtService);

        when(userSessionRepository.save(any(UserSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.refreshTokenExpiresAt(any(Instant.class))).thenAnswer(invocation ->
                ((Instant) invocation.getArgument(0)).plus(Duration.ofDays(30))
        );
    }

    @Test
    void loginShouldCreateSessionAndReturnRefreshToken() {
        UserAccount user = userAccount("north");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);
        when(jwtService.issueAccessToken(eq(user), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(1);
            return new JwtService.IssuedAccessToken("access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthResponse response = authService.login(new LoginRequest("North", "password"));

        assertThat(response.token()).isEqualTo("access-token");
        assertThat(response.refreshToken()).startsWith(response.sessionId() + ".");
        assertThat(response.user().username()).isEqualTo("north");
        assertThat(response.refreshTokenExpiresAt()).isAfter(response.tokenExpiresAt());
    }

    @Test
    void refreshShouldRotateExistingSessionToken() {
        UserAccount user = userAccount("north");
        UUID sessionId = UUID.randomUUID();
        String previousSecret = "previous-secret";
        String previousHash = sha256Hex(previousSecret);
        UserSession session = new UserSession(
                sessionId,
                user.getId(),
                previousHash,
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(10)),
                Instant.now().plus(Duration.ofDays(1)),
                null
        );

        when(userSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(jwtService.issueAccessToken(eq(user), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(1);
            return new JwtService.IssuedAccessToken("rotated-access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthResponse response = authService.refresh(new RefreshTokenRequest(sessionId + "." + previousSecret));

        assertThat(response.sessionId()).isEqualTo(sessionId);
        assertThat(response.token()).isEqualTo("rotated-access-token");
        assertThat(response.refreshToken()).startsWith(sessionId + ".");
        assertThat(response.refreshToken()).isNotEqualTo(sessionId + "." + previousSecret);
        assertThat(session.getTokenHash()).isNotEqualTo(previousHash);
    }

    @Test
    void revokeSessionShouldMarkOwnedSessionAsRevoked() {
        UserAccount user = userAccount("north");
        UserSession session = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("owned-secret"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                null
        );

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(userSessionRepository.findById(session.getId())).thenReturn(Optional.of(session));

        authService.revokeSession("north", session.getId());

        assertThat(session.getRevokedAt()).isNotNull();
    }

    private UserAccount userAccount(String username) {
        return new UserAccount(
                UUID.randomUUID(),
                username,
                "North",
                "password-hash",
                Instant.now().minus(Duration.ofDays(1))
        );
    }

    private String sha256Hex(String rawValue) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawValue.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
