package com.north.messenger.application.auth;

import com.north.messenger.domain.model.PasswordResetToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.PasswordResetTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PasswordResetServiceTest {

    private UserAccountRepository userAccountRepository;
    private PasswordResetTokenRepository passwordResetTokenRepository;
    private UserSessionRepository userSessionRepository;
    private PasswordEncoder passwordEncoder;
    private PasswordPolicyService passwordPolicyService;
    private ApplicationEventPublisher eventPublisher;
    private PasswordResetService passwordResetService;

    @BeforeEach
    void setUp() {
        userAccountRepository = mock(UserAccountRepository.class);
        passwordResetTokenRepository = mock(PasswordResetTokenRepository.class);
        userSessionRepository = mock(UserSessionRepository.class);
        passwordEncoder = new BCryptPasswordEncoder();
        passwordPolicyService = mock(PasswordPolicyService.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        passwordResetService = new PasswordResetService(
                userAccountRepository,
                passwordResetTokenRepository,
                userSessionRepository,
                passwordEncoder,
                passwordPolicyService,
                new PasswordResetProperties(
                        true,
                        Duration.ofMinutes(30),
                        "https://app.example/reset-password",
                        "no-reply@example.com"
                ),
                eventPublisher
        );

        when(userAccountRepository.save(any(UserAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userSessionRepository.save(any(UserSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void requestPasswordResetShouldBeSilentForUnknownEmail() {
        when(userAccountRepository.findByEmailIgnoreCase("missing@example.com")).thenReturn(Optional.empty());

        passwordResetService.requestPasswordReset(" Missing@Example.com ");

        verify(passwordResetTokenRepository, never()).save(any(PasswordResetToken.class));
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void requestPasswordResetShouldCreateTokenAndPublishEventForExistingEmail() {
        UserAccount user = userAccount("north", "north@example.com", "old-password");
        PasswordResetToken previousToken = activeToken(user.getId(), "previous-token");
        when(userAccountRepository.findByEmailIgnoreCase("north@example.com")).thenReturn(Optional.of(user));
        when(passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId())).thenReturn(List.of(previousToken));

        passwordResetService.requestPasswordReset("North@Example.com");

        assertThat(previousToken.getUsedAt()).isNotNull();
        verify(passwordResetTokenRepository).save(any(PasswordResetToken.class));
        verify(eventPublisher).publishEvent(any(PasswordResetRequestedEvent.class));
    }

    @Test
    void resetPasswordShouldUpdateHashRevokeSessionsAndInvalidateTokens() {
        UserAccount user = userAccount("north", "north@example.com", "old-password");
        PasswordResetToken matchingToken = activeToken(user.getId(), "reset-token");
        PasswordResetToken secondaryToken = activeToken(user.getId(), "another-token");
        UserSession firstSession = activeSession(user.getId(), "first-secret");
        UserSession secondSession = activeSession(user.getId(), "second-secret");

        when(passwordResetTokenRepository.findByTokenHashForUpdate(sha256Hex("reset-token")))
                .thenReturn(Optional.of(matchingToken));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId()))
                .thenReturn(List.of(matchingToken, secondaryToken));
        when(userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId()))
                .thenReturn(List.of(firstSession, secondSession));

        passwordResetService.resetPassword("reset-token", "riverlantern");

        assertThat(passwordEncoder.matches("riverlantern", user.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("old-password", user.getPasswordHash())).isFalse();
        assertThat(matchingToken.getUsedAt()).isNotNull();
        assertThat(secondaryToken.getUsedAt()).isNotNull();
        assertThat(firstSession.getRevokedAt()).isNotNull();
        assertThat(secondSession.getRevokedAt()).isNotNull();
        verify(passwordPolicyService).validatePassword("north", "North", "riverlantern");
        verify(eventPublisher, times(2)).publishEvent(any(SessionRevokedEvent.class));
    }

    @Test
    void resetPasswordShouldAllowTokenExactlyOnce() {
        UserAccount user = userAccount("north", "north@example.com", "old-password");
        PasswordResetToken matchingToken = activeToken(user.getId(), "reset-token");
        when(passwordResetTokenRepository.findByTokenHashForUpdate(sha256Hex("reset-token")))
                .thenReturn(Optional.of(matchingToken));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId()))
                .thenReturn(List.of(matchingToken));
        when(userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId()))
                .thenReturn(List.of());

        passwordResetService.resetPassword("reset-token", "riverlantern");

        assertThatThrownBy(() -> passwordResetService.resetPassword("reset-token", "forestpath"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).isEqualTo("Password reset token is invalid or expired");
                });
    }

    @Test
    void resetPasswordShouldRejectExpiredToken() {
        UserAccount user = userAccount("north", "north@example.com", "old-password");
        PasswordResetToken expiredToken = new PasswordResetToken(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("reset-token"),
                Instant.now().minus(Duration.ofHours(2)),
                Instant.now().minus(Duration.ofMinutes(1)),
                null
        );

        when(passwordResetTokenRepository.findByTokenHashForUpdate(sha256Hex("reset-token")))
                .thenReturn(Optional.of(expiredToken));

        assertThatThrownBy(() -> passwordResetService.resetPassword("reset-token", "riverlantern"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).isEqualTo("Password reset token is invalid or expired");
                });
    }

    private UserAccount userAccount(String username, String email, String password) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                email,
                "North",
                null,
                null,
                passwordEncoder.encode(password),
                Instant.now().minus(Duration.ofDays(1))
        );
    }

    private PasswordResetToken activeToken(UUID userId, String rawToken) {
        return new PasswordResetToken(
                UUID.randomUUID(),
                userId,
                sha256Hex(rawToken),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofMinutes(25)),
                null
        );
    }

    private UserSession activeSession(UUID userId, String rawSecret) {
        return new UserSession(
                UUID.randomUUID(),
                userId,
                sha256Hex(rawSecret),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Desktop",
                null
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
