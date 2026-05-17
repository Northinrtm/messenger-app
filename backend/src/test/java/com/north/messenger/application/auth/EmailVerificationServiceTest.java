package com.north.messenger.application.auth;

import com.north.messenger.domain.model.EmailVerificationToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.EmailVerificationTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
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
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailVerificationServiceTest {

    private UserAccountRepository userAccountRepository;
    private EmailVerificationTokenRepository emailVerificationTokenRepository;
    private ApplicationEventPublisher eventPublisher;
    private EmailVerificationEmailSender emailVerificationEmailSender;
    private EmailVerificationService emailVerificationService;

    @BeforeEach
    void setUp() {
        userAccountRepository = mock(UserAccountRepository.class);
        emailVerificationTokenRepository = mock(EmailVerificationTokenRepository.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        emailVerificationEmailSender = mock(EmailVerificationEmailSender.class);
        emailVerificationService = new EmailVerificationService(
                userAccountRepository,
                emailVerificationTokenRepository,
                new EmailVerificationProperties(
                        true,
                        Duration.ofHours(24),
                        "https://app.example/",
                        "no-reply@example.com"
                ),
                eventPublisher,
                emailVerificationEmailSender
        );

        when(userAccountRepository.save(any(UserAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void issueVerificationForRegisteredUserShouldCreateTokenAndPublishEvent() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken previousToken = activeToken(user.getId(), "old-token");
        when(emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId())).thenReturn(List.of(previousToken));

        emailVerificationService.issueVerificationForRegisteredUser(user);

        assertThat(previousToken.getUsedAt()).isNotNull();
        verify(emailVerificationTokenRepository).save(any(EmailVerificationToken.class));
        verify(eventPublisher).publishEvent(any(EmailVerificationRequestedEvent.class));
    }

    @Test
    void issueVerificationForRegisteredUserShouldLeaveUserUnverifiedWhenFeatureIsDisabled() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationService disabledEmailVerificationService = new EmailVerificationService(
                userAccountRepository,
                emailVerificationTokenRepository,
                new EmailVerificationProperties(
                        false,
                        Duration.ofHours(24),
                        "",
                        ""
                ),
                eventPublisher,
                emailVerificationEmailSender
        );

        disabledEmailVerificationService.issueVerificationForRegisteredUser(user);

        assertThat(user.isEmailVerified()).isFalse();
        verify(userAccountRepository, never()).save(any(UserAccount.class));
        verify(emailVerificationTokenRepository, never()).save(any(EmailVerificationToken.class));
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void verifyEmailShouldMarkUserVerifiedAndInvalidateTokens() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken matchingToken = activeToken(user.getId(), "verify-token");
        EmailVerificationToken secondaryToken = activeToken(user.getId(), "another-token");
        when(emailVerificationTokenRepository.findByTokenHashForUpdate(sha256Hex("verify-token")))
                .thenReturn(Optional.of(matchingToken));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId()))
                .thenReturn(List.of(matchingToken, secondaryToken));

        emailVerificationService.verifyEmail("verify-token");

        assertThat(user.isEmailVerified()).isTrue();
        assertThat(matchingToken.getUsedAt()).isNotNull();
        assertThat(secondaryToken.getUsedAt()).isNotNull();
    }

    @Test
    void verifyEmailShouldRejectExpiredToken() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken expiredToken = new EmailVerificationToken(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("verify-token"),
                Instant.now().minus(Duration.ofHours(2)),
                Instant.now().minus(Duration.ofMinutes(1)),
                null
        );
        when(emailVerificationTokenRepository.findByTokenHashForUpdate(sha256Hex("verify-token")))
                .thenReturn(Optional.of(expiredToken));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> emailVerificationService.verifyEmail("verify-token"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.GONE);
                    assertThat(responseStatusException.getReason()).isEqualTo("Email verification token is expired");
                });
    }

    @Test
    void verifyEmailShouldRejectTokenReuseAfterSuccessfulVerification() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken usedToken = new EmailVerificationToken(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("verify-token"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().plus(Duration.ofHours(23)),
                Instant.now().minus(Duration.ofMinutes(5))
        );
        user.markEmailVerified(Instant.now().minus(Duration.ofMinutes(1)));
        when(emailVerificationTokenRepository.findByTokenHashForUpdate(sha256Hex("verify-token")))
                .thenReturn(Optional.of(usedToken));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId()))
                .thenReturn(List.of());

        assertThatThrownBy(() -> emailVerificationService.verifyEmail("verify-token"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(responseStatusException.getReason()).isEqualTo("Email is already verified");
                });
    }

    @Test
    void resendVerificationEmailShouldBeSilentForUnknownOrVerifiedEmail() {
        when(userAccountRepository.findByEmailIgnoreCase("missing@example.com")).thenReturn(Optional.empty());

        emailVerificationService.resendVerificationEmail("missing@example.com");

        verify(emailVerificationTokenRepository, never()).save(any(EmailVerificationToken.class));
        verify(eventPublisher, never()).publishEvent(any());
        verify(emailVerificationEmailSender, never()).sendVerificationEmail(any(), any());

        UserAccount verifiedUser = verifiedUser("north", "north@example.com");
        when(userAccountRepository.findByEmailIgnoreCase("north@example.com")).thenReturn(Optional.of(verifiedUser));

        emailVerificationService.resendVerificationEmail("north@example.com");

        verify(emailVerificationTokenRepository, never()).save(any(EmailVerificationToken.class));
        verify(emailVerificationEmailSender, never()).sendVerificationEmail(any(), any());
    }

    @Test
    void resendVerificationEmailShouldRotateActiveTokensForExistingUnverifiedEmail() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken previousToken = activeToken(user.getId(), "old-token");
        when(userAccountRepository.findByEmailIgnoreCase("north@example.com")).thenReturn(Optional.of(user));
        when(emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId())).thenReturn(List.of(previousToken));

        emailVerificationService.resendVerificationEmail("North@Example.com");

        assertThat(previousToken.getUsedAt()).isNotNull();
        verify(emailVerificationTokenRepository).save(any(EmailVerificationToken.class));
        verify(emailVerificationEmailSender).sendVerificationEmail(eq("north@example.com"), any());
        verify(eventPublisher, never()).publishEvent(any(EmailVerificationRequestedEvent.class));
    }

    @Test
    void resendVerificationEmailForAuthenticatedUserShouldRotateActiveTokens() {
        UserAccount user = unverifiedUser("north", "north@example.com");
        EmailVerificationToken previousToken = activeToken(user.getId(), "old-token");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId())).thenReturn(List.of(previousToken));

        emailVerificationService.resendVerificationEmailForAuthenticatedUser("North");

        assertThat(previousToken.getUsedAt()).isNotNull();
        verify(emailVerificationTokenRepository).save(any(EmailVerificationToken.class));
        verify(emailVerificationEmailSender).sendVerificationEmail(eq("north@example.com"), any());
        verify(eventPublisher, never()).publishEvent(any(EmailVerificationRequestedEvent.class));
    }

    private UserAccount verifiedUser(String username, String email) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                email,
                "North",
                null,
                null,
                "password-hash",
                Instant.now().minus(Duration.ofDays(1)),
                Instant.now().minus(Duration.ofHours(12))
        );
    }

    private UserAccount unverifiedUser(String username, String email) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                email,
                "North",
                null,
                null,
                "password-hash",
                Instant.now().minus(Duration.ofDays(1)),
                null
        );
    }

    private EmailVerificationToken activeToken(UUID userId, String rawToken) {
        return new EmailVerificationToken(
                UUID.randomUUID(),
                userId,
                sha256Hex(rawToken),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofHours(23)),
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
