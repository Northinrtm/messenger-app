package com.north.messenger.application.auth;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.ChangePasswordRequest;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserContact;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserBlockRepository;
import com.north.messenger.domain.repository.UserContactRepository;
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
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceTest {

    private UserAccountRepository userAccountRepository;
    private UserContactRepository userContactRepository;
    private UserBlockRepository userBlockRepository;
    private UserSessionRepository userSessionRepository;
    private ChatRoomRepository chatRoomRepository;
    private PasswordEncoder passwordEncoder;
    private PasswordPolicyService passwordPolicyService;
    private JwtService jwtService;
    private ApplicationEventPublisher eventPublisher;
    private AvatarService avatarService;
    private EmailVerificationService emailVerificationService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        userAccountRepository = mock(UserAccountRepository.class);
        userContactRepository = mock(UserContactRepository.class);
        userBlockRepository = mock(UserBlockRepository.class);
        userSessionRepository = mock(UserSessionRepository.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        passwordPolicyService = mock(PasswordPolicyService.class);
        jwtService = mock(JwtService.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        avatarService = mock(AvatarService.class);
        emailVerificationService = mock(EmailVerificationService.class);
        authService = new AuthService(
                userAccountRepository,
                userContactRepository,
                userBlockRepository,
                userSessionRepository,
                chatRoomRepository,
                passwordEncoder,
                passwordPolicyService,
                jwtService,
                eventPublisher,
                avatarService,
                emailVerificationService,
                new String[]{"example.com", "example.test", "gmail.com"}
        );

        when(userSessionRepository.save(any(UserSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userContactRepository.save(any(UserContact.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(avatarService.resolveAvatarUrl(any(UserAccount.class))).thenReturn(null);
        when(emailVerificationService.isEnabled()).thenReturn(true);
        when(jwtService.refreshTokenExpiresAt(any(Instant.class))).thenAnswer(invocation ->
                ((Instant) invocation.getArgument(0)).plus(Duration.ofDays(30))
        );
    }

    @Test
    void loginShouldCreateSessionAndReturnRefreshToken() {
        UserAccount user = userAccount("north");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);
        when(jwtService.issueAccessToken(eq(user), any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(2);
            return new JwtService.IssuedAccessToken("access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthService.IssuedAuthSession issuedAuthSession = authService.login(new LoginRequest("North", "password"), null);
        AuthResponse response = issuedAuthSession.response();

        assertThat(response.token()).isEqualTo("access-token");
        assertThat(issuedAuthSession.refreshToken()).startsWith(response.sessionId() + ".");
        assertThat(response.user().username()).isEqualTo("north");
        assertThat(response.tokenExpiresAt()).isAfter(Instant.now());
    }

    @Test
    void registerShouldNormalizePersistEmailLeaveUserUnverifiedAndCreateSession() {
        when(userAccountRepository.existsByUsernameIgnoreCase("north")).thenReturn(false);
        when(userAccountRepository.existsByEmailIgnoreCase("north@example.com")).thenReturn(false);
        when(userAccountRepository.existsByDisplayNameIgnoreCase("North")).thenReturn(false);
        when(passwordEncoder.encode("riverlantern")).thenReturn("encoded-password");
        when(userAccountRepository.save(any(UserAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issueAccessToken(any(UserAccount.class), any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(2);
            return new JwtService.IssuedAccessToken("register-access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthService.IssuedAuthSession issuedAuthSession = authService.register(
                new RegisterRequest("North", "North@Example.com", "North", "riverlantern"),
                "Mozilla/5.0"
        );

        ArgumentCaptor<UserAccount> userCaptor = ArgumentCaptor.forClass(UserAccount.class);
        verify(userAccountRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getUsername()).isEqualTo("north");
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("north@example.com");
        assertThat(userCaptor.getValue().getEmailVerifiedAt()).isNull();
        assertThat(issuedAuthSession.response().token()).isEqualTo("register-access-token");
        assertThat(issuedAuthSession.response().user().email()).isEqualTo("north@example.com");
        assertThat(issuedAuthSession.response().user().emailVerified()).isFalse();
        assertThat(issuedAuthSession.response().user().emailVerificationEnabled()).isTrue();
        verify(emailVerificationService).issueVerificationForRegisteredUser(userCaptor.getValue());
    }

    @Test
    void registerShouldLeaveUserUnverifiedEvenWhenEmailVerificationFeatureIsDisabled() {
        when(emailVerificationService.isEnabled()).thenReturn(false);
        when(userAccountRepository.existsByUsernameIgnoreCase("north")).thenReturn(false);
        when(userAccountRepository.existsByEmailIgnoreCase("north@example.com")).thenReturn(false);
        when(userAccountRepository.existsByDisplayNameIgnoreCase("North")).thenReturn(false);
        when(passwordEncoder.encode("riverlantern")).thenReturn("encoded-password");
        when(userAccountRepository.save(any(UserAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issueAccessToken(any(UserAccount.class), any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(2);
            return new JwtService.IssuedAccessToken("register-access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthService.IssuedAuthSession issuedAuthSession = authService.register(
                new RegisterRequest("North", "North@Example.com", "North", "riverlantern"),
                "Mozilla/5.0"
        );

        ArgumentCaptor<UserAccount> userCaptor = ArgumentCaptor.forClass(UserAccount.class);
        verify(userAccountRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getEmailVerifiedAt()).isNull();
        assertThat(issuedAuthSession.response().user().emailVerified()).isFalse();
        assertThat(issuedAuthSession.response().user().emailVerificationEnabled()).isFalse();
        verify(emailVerificationService).issueVerificationForRegisteredUser(userCaptor.getValue());
    }

    @Test
    void registerShouldRejectDuplicateEmailIgnoringCase() {
        when(userAccountRepository.existsByUsernameIgnoreCase("north")).thenReturn(false);
        when(userAccountRepository.existsByEmailIgnoreCase("north@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("North", "North@Example.com", "North", "riverlantern"),
                null
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(responseStatusException.getReason()).isEqualTo("Email is already in use");
                });
    }

    @Test
    void registerShouldRejectUnsupportedEmailDomain() {
        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("North", "north@unsupported.dev", "North", "riverlantern"),
                null
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).isEqualTo("Email domain is not supported for registration");
                });

        verify(userAccountRepository, never()).existsByUsernameIgnoreCase(any());
        verify(userAccountRepository, never()).save(any(UserAccount.class));
    }

    @Test
    void registerShouldRejectInvalidUsernameBeforeRepositoryLookup() {
        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("----", "north@example.com", "North", "riverlantern"),
                null
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).contains("Username");
                });

        verify(userAccountRepository, never()).existsByUsernameIgnoreCase(any());
        verify(userAccountRepository, never()).save(any(UserAccount.class));
    }

    @Test
    void registerShouldRejectInvalidEmailFormatBeforeRepositoryLookup() {
        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("north", "????????????@mail.ru", "North", "riverlantern"),
                null
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).contains("Email");
                });

        verify(userAccountRepository, never()).existsByUsernameIgnoreCase(any());
        verify(userAccountRepository, never()).save(any(UserAccount.class));
    }

    @Test
    void registerShouldRejectInvalidDisplayNameBeforeRepositoryLookup() {
        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("north", "north@example.com", "&&&&&&&&&&", "riverlantern"),
                null
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(responseStatusException.getReason()).contains("Display name");
                });

        verify(userAccountRepository, never()).existsByUsernameIgnoreCase(any());
        verify(userAccountRepository, never()).save(any(UserAccount.class));
    }

    @Test
    void loginShouldRejectUnknownUsernameAsInvalidCredentials() {
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("North", "password"), null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(responseStatusException.getReason()).isEqualTo("Invalid credentials");
                });
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
                "Test device",
                null
        );

        when(userSessionRepository.findByIdForUpdate(sessionId)).thenReturn(Optional.of(session));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(jwtService.issueAccessToken(eq(user), any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(2);
            return new JwtService.IssuedAccessToken("rotated-access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthService.IssuedAuthSession issuedAuthSession = authService.refresh(sessionId + "." + previousSecret);
        AuthResponse response = issuedAuthSession.response();

        assertThat(response.sessionId()).isEqualTo(sessionId);
        assertThat(response.token()).isEqualTo("rotated-access-token");
        assertThat(issuedAuthSession.refreshToken()).startsWith(sessionId + ".");
        assertThat(issuedAuthSession.refreshToken()).isNotEqualTo(sessionId + "." + previousSecret);
        assertThat(session.getTokenHash()).isNotEqualTo(previousHash);
        verify(userSessionRepository).findByIdForUpdate(sessionId);
        verify(userSessionRepository, never()).findById(sessionId);
    }

    @Test
    void loginShouldAllowUnverifiedUser() {
        UserAccount user = unverifiedUserAccount("north");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);
        when(jwtService.issueAccessToken(eq(user), any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            Instant issuedAt = invocation.getArgument(2);
            return new JwtService.IssuedAccessToken("unverified-access-token", issuedAt.plus(Duration.ofHours(12)));
        });

        AuthService.IssuedAuthSession issuedAuthSession = authService.login(new LoginRequest("North", "password"), null);

        assertThat(issuedAuthSession.response().token()).isEqualTo("unverified-access-token");
        assertThat(issuedAuthSession.response().user().emailVerified()).isFalse();
    }

    @Test
    void meShouldExposeOwnEmailVerificationState() {
        UserAccount user = unverifiedUserAccount("north");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));

        var profile = authService.me("north");

        assertThat(profile.email()).isEqualTo("north@example.com");
        assertThat(profile.emailVerified()).isFalse();
        assertThat(profile.emailVerificationEnabled()).isTrue();
    }

    @Test
    void logoutShouldOnlyRevokeSessionWithoutRetiringEncryptionDevice() {
        UserAccount user = userAccount("north");
        UUID sessionId = UUID.randomUUID();
        String refreshSecret = "logout-secret";
        UserSession session = new UserSession(
                sessionId,
                user.getId(),
                sha256Hex(refreshSecret),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Desktop",
                null
        );

        when(userSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));

        authService.logout(sessionId + "." + refreshSecret);

        assertThat(session.getRevokedAt()).isNotNull();
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
                "Test device",
                null
        );

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(userSessionRepository.findById(session.getId())).thenReturn(Optional.of(session));

        authService.revokeSession("north", session.getId());

        assertThat(session.getRevokedAt()).isNotNull();
    }

    @Test
    void deleteAccountShouldRemoveUserCleanupChatsAndRevokeSessions() {
        UserAccount user = userAccount("north");
        UserSession firstSession = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("first-secret"),
                Instant.now().minus(Duration.ofHours(2)),
                Instant.now().minus(Duration.ofMinutes(10)),
                Instant.now().plus(Duration.ofDays(1)),
                "Desktop",
                null
        );
        UserSession secondSession = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("second-secret"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Mobile",
                null
        );

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId()))
                .thenReturn(java.util.List.of(firstSession, secondSession));

        authService.deleteAccount("north");

        verify(userAccountRepository).delete(user);
        verify(userAccountRepository).flush();
        verify(chatRoomRepository).deleteDirectRoomsWithFewerThanTwoParticipants();
        verify(chatRoomRepository).deleteRoomsWithoutParticipants();
        verify(eventPublisher, times(2)).publishEvent(any(SessionRevokedEvent.class));
    }

    @Test
    void requireExistingUserShouldReturnNotFoundForUnknownUsername() {
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.requireExistingUser("North"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(responseStatusException.getReason()).isEqualTo("User not found");
                });
    }

    @Test
    void requireAuthenticatedUserShouldReturnUnauthorizedForUnknownUsername() {
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.requireAuthenticatedUser("North"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(responseStatusException.getReason()).isEqualTo("Authenticated user not found");
                });
    }

    @Test
    void authenticateAccessTokenShouldRejectRevokedSession() {
        UserAccount user = userAccount("north");
        UUID sessionId = UUID.randomUUID();
        UserSession session = new UserSession(
                sessionId,
                user.getId(),
                sha256Hex("owned-secret"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Test device",
                Instant.now().minus(Duration.ofMinutes(1))
        );

        when(jwtService.readAccessToken("access-token")).thenReturn(new JwtService.AccessTokenClaims(
                "north",
                user.getId(),
                sessionId,
                Instant.now().plus(Duration.ofHours(1))
        ));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(userSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        assertThat(authService.authenticateAccessToken("access-token")).isEmpty();
    }

    @Test
    void authenticateAccessTokenShouldTouchActiveSession() {
        UserAccount user = userAccount("north");
        UUID sessionId = UUID.randomUUID();
        UserSession session = new UserSession(
                sessionId,
                user.getId(),
                sha256Hex("owned-secret"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Test device",
                null
        );

        when(jwtService.readAccessToken("access-token")).thenReturn(new JwtService.AccessTokenClaims(
                "north",
                user.getId(),
                sessionId,
                Instant.now().plus(Duration.ofHours(1))
        ));
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(userSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        AuthService.AuthenticatedSession authenticatedSession = authService.authenticateAccessToken("access-token")
                .orElseThrow();

        assertThat(authenticatedSession.user().getId()).isEqualTo(user.getId());
        assertThat(authenticatedSession.sessionId()).isEqualTo(sessionId);
    }

    @Test
    void addContactShouldPersistAnotherUser() {
        UserAccount currentUser = userAccount("north");
        UserAccount contactUser = userAccount("alice");
        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(currentUser));
        when(userAccountRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(contactUser));

        var response = authService.addContact("north", "alice");

        assertThat(response.username()).isEqualTo("alice");
    }

    @Test
    void changePasswordShouldUpdateHash() {
        UserAccount user = userAccount("north");
        UserSession firstSession = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("first-secret"),
                Instant.now().minus(Duration.ofHours(2)),
                Instant.now().minus(Duration.ofMinutes(10)),
                Instant.now().plus(Duration.ofDays(1)),
                "Desktop",
                null
        );
        UserSession secondSession = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                sha256Hex("second-secret"),
                Instant.now().minus(Duration.ofHours(1)),
                Instant.now().minus(Duration.ofMinutes(5)),
                Instant.now().plus(Duration.ofDays(1)),
                "Mobile",
                null
        );
        ChangePasswordRequest request = new ChangePasswordRequest("current-password", "betterpass");

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("current-password", user.getPasswordHash())).thenReturn(true);
        when(passwordEncoder.matches("betterpass", user.getPasswordHash())).thenReturn(false);
        when(passwordEncoder.encode("betterpass")).thenReturn("new-password-hash");
        when(userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId()))
                .thenReturn(java.util.List.of(firstSession, secondSession));

        authService.changePassword("north", request);

        assertThat(user.getPasswordHash()).isEqualTo("new-password-hash");
        assertThat(firstSession.getRevokedAt()).isNotNull();
        assertThat(secondSession.getRevokedAt()).isNotNull();
        verify(passwordPolicyService).validatePassword("north", "North", "betterpass");
        verify(eventPublisher, times(2)).publishEvent(any(SessionRevokedEvent.class));
    }

    @Test
    void changePasswordShouldRejectInvalidCurrentPassword() {
        UserAccount user = userAccount("north");
        ChangePasswordRequest request = new ChangePasswordRequest("wrong-password", "betterpass");

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong-password", user.getPasswordHash())).thenReturn(false);

        assertThatThrownBy(() -> authService.changePassword("north", request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(responseStatusException.getReason()).isEqualTo("Current password is invalid");
                });
    }

    @Test
    void changePasswordShouldSucceedWithoutLegacyEncryptionBundle() {
        UserAccount user = userAccount("north");
        ChangePasswordRequest request = new ChangePasswordRequest("current-password", "betterpass");

        when(userAccountRepository.findByUsernameIgnoreCase("north")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("current-password", user.getPasswordHash())).thenReturn(true);
        when(passwordEncoder.matches("betterpass", user.getPasswordHash())).thenReturn(false);
        when(passwordEncoder.encode("betterpass")).thenReturn("new-password-hash");
        when(userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId()))
                .thenReturn(java.util.List.of());

        authService.changePassword("north", request);

        assertThat(user.getPasswordHash()).isEqualTo("new-password-hash");
    }

    private UserAccount userAccount(String username) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                "North",
                "password-hash",
                Instant.now().minus(Duration.ofDays(1))
        );
    }

    private UserAccount unverifiedUserAccount(String username) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                username + "@example.com",
                "North",
                null,
                null,
                "password-hash",
                Instant.now().minus(Duration.ofDays(1)),
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
