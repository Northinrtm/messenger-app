package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ResolveEncryptionAccountKeysRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResolveResponse;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResponse;
import com.north.messenger.api.dto.UserEncryptionSessionResetRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserEncryptionAccountKey;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserEncryptionAccountKeyServiceTest {

    private static final String IDENTITY_KEY_ALGORITHM = IdentitySignedAccountKeyService.IDENTITY_KEY_ALGORITHM;
    private static final String ACCOUNT_KEY_ALGORITHM = IdentitySignedAccountKeyService.ACCOUNT_KEY_ALGORITHM;
    private static final Instant SIGNED_AT = Instant.parse("2026-04-10T10:05:00Z");

    private AuthService authService;
    private UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private IdentitySignedAccountKeyService identitySignedAccountKeyService;
    private ApplicationEventPublisher eventPublisher;
    private UserEncryptionAccountKeyService userEncryptionAccountKeyService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        userEncryptionAccountKeyRepository = mock(UserEncryptionAccountKeyRepository.class);
        identitySignedAccountKeyService = mock(IdentitySignedAccountKeyService.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        userEncryptionAccountKeyService = new UserEncryptionAccountKeyService(
                authService,
                userEncryptionAccountKeyRepository,
                identitySignedAccountKeyService,
                eventPublisher
        );

        when(userEncryptionAccountKeyRepository.save(any(UserEncryptionAccountKey.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(identitySignedAccountKeyService.parseSignedAt(anyString())).thenReturn(SIGNED_AT);
    }

    @Test
    void upsertOwnAccountKeyShouldCreateAndPublishChangeEvent() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId)).thenReturn(Optional.empty());

        UserEncryptionAccountKeyResponse response = userEncryptionAccountKeyService.upsertOwnAccountKey(
                "north",
                "token",
                new UserEncryptionAccountKeyRequest(
                        "{\"kty\":\"RSA\"}",
                        1L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "signature"
                )
        );

        assertThat(response.publicKey()).isEqualTo("{\"kty\":\"RSA\"}");
        assertThat(response.accountKeyVersion()).isEqualTo(1L);
        assertThat(response.identityGeneration()).isEqualTo(1L);
        verify(userEncryptionAccountKeyRepository).save(any(UserEncryptionAccountKey.class));
        verify(eventPublisher).publishEvent(new UserAccountKeyChangedEvent(userId));
    }

    @Test
    void upsertOwnAccountKeyShouldUpdateWithoutPublishingWhenUnchanged() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-10T10:00:00Z");
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                createdAt
        );
        UserEncryptionAccountKey existingAccountKey = new UserEncryptionAccountKey(
                UUID.randomUUID(),
                userId,
                "{\"kty\":\"RSA\"}",
                1L,
                "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                "signature",
                createdAt,
                createdAt
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId))
                .thenReturn(Optional.of(existingAccountKey));

        UserEncryptionAccountKeyResponse response = userEncryptionAccountKeyService.upsertOwnAccountKey(
                "north",
                "token",
                new UserEncryptionAccountKeyRequest(
                        "{\"kty\":\"RSA\"}",
                        1L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "next-signature"
                )
        );

        assertThat(response.publicKey()).isEqualTo("{\"kty\":\"RSA\"}");
        assertThat(existingAccountKey.getAccountKeyVersion()).isEqualTo(1L);
        assertThat(existingAccountKey.getAccountKeySignature()).isEqualTo("next-signature");
        verify(userEncryptionAccountKeyRepository).save(existingAccountKey);
        verify(eventPublisher, never()).publishEvent(any(UserAccountKeyChangedEvent.class));
    }

    @Test
    void upsertOwnAccountKeyShouldIncrementVersionWhenChanged() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-10T10:00:00Z");
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                createdAt
        );
        UserEncryptionAccountKey existingAccountKey = new UserEncryptionAccountKey(
                UUID.randomUUID(),
                userId,
                "{\"kty\":\"RSA\",\"kid\":\"old\"}",
                1L,
                "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                "old-signature",
                createdAt,
                createdAt
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId))
                .thenReturn(Optional.of(existingAccountKey));

        userEncryptionAccountKeyService.upsertOwnAccountKey(
                "north",
                "token",
                new UserEncryptionAccountKeyRequest(
                        "{\"kty\":\"RSA\",\"kid\":\"new\"}",
                        2L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "new-signature"
                )
        );

        assertThat(existingAccountKey.getAccountKeyVersion()).isEqualTo(2L);
        assertThat(existingAccountKey.getAccountKeySignature()).isEqualTo("new-signature");
        verify(userEncryptionAccountKeyRepository).save(existingAccountKey);
        verify(eventPublisher).publishEvent(new UserAccountKeyChangedEvent(userId));
    }

    @Test
    void resolveAccountPublicKeysShouldReturnStoredRegistryEntries() {
        UUID requesterId = UUID.randomUUID();
        UUID requesterSessionId = UUID.randomUUID();
        UUID recipientOneId = UUID.randomUUID();
        UUID recipientTwoId = UUID.randomUUID();
        var requester = testUserAccount(
                requesterId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(requester, requesterSessionId));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(List.of(recipientOneId, recipientTwoId)))
                .thenReturn(List.of(
                        new UserEncryptionAccountKey(
                                UUID.randomUUID(),
                                recipientOneId,
                                "{\"kty\":\"RSA\",\"kid\":\"one\"}",
                                1L,
                                "{\"kty\":\"RSA\",\"kid\":\"identity-one\"}",
                                IDENTITY_KEY_ALGORITHM,
                                ACCOUNT_KEY_ALGORITHM,
                                SIGNED_AT,
                                "signature-one",
                                Instant.parse("2026-04-10T10:00:00Z"),
                                Instant.parse("2026-04-10T10:00:00Z")
                        ),
                        new UserEncryptionAccountKey(
                                UUID.randomUUID(),
                                recipientTwoId,
                                "{\"kty\":\"RSA\",\"kid\":\"two\"}",
                                1L,
                                "{\"kty\":\"RSA\",\"kid\":\"identity-two\"}",
                                IDENTITY_KEY_ALGORITHM,
                                ACCOUNT_KEY_ALGORITHM,
                                SIGNED_AT,
                                "signature-two",
                                Instant.parse("2026-04-10T10:00:00Z"),
                                Instant.parse("2026-04-10T10:00:00Z")
                        )
                ));

        List<UserEncryptionAccountKeyResolveResponse> responses =
                userEncryptionAccountKeyService.resolveAccountPublicKeys(
                        "north",
                        "token",
                        new ResolveEncryptionAccountKeysRequest(List.of(recipientOneId, recipientTwoId))
                );

        assertThat(responses).containsExactly(
                new UserEncryptionAccountKeyResolveResponse(
                        recipientOneId,
                        "{\"kty\":\"RSA\",\"kid\":\"one\"}",
                        1L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity-one\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "signature-one"
                ),
                new UserEncryptionAccountKeyResolveResponse(
                        recipientTwoId,
                        "{\"kty\":\"RSA\",\"kid\":\"two\"}",
                        1L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity-two\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "signature-two"
                )
        );
    }

    @Test
    void upsertOwnAccountKeyShouldRejectInitialVersionOtherThanOne() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userEncryptionAccountKeyService.upsertOwnAccountKey(
                "north",
                "token",
                new UserEncryptionAccountKeyRequest(
                        "{\"kty\":\"RSA\"}",
                        2L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "signature"
                )
        )).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("Initial account key version and identity generation must both be 1");

        verify(userEncryptionAccountKeyRepository, never()).save(any(UserEncryptionAccountKey.class));
    }

    @Test
    void upsertOwnAccountKeyShouldRejectIdentitySigningKeyChange() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-10T10:00:00Z");
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                createdAt
        );
        UserEncryptionAccountKey existingAccountKey = new UserEncryptionAccountKey(
                UUID.randomUUID(),
                userId,
                "{\"kty\":\"RSA\",\"kid\":\"old\"}",
                1L,
                "{\"kty\":\"RSA\",\"kid\":\"identity-old\"}",
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                "old-signature",
                createdAt,
                createdAt
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId))
                .thenReturn(Optional.of(existingAccountKey));

        assertThatThrownBy(() -> userEncryptionAccountKeyService.upsertOwnAccountKey(
                "north",
                "token",
                new UserEncryptionAccountKeyRequest(
                        "{\"kty\":\"RSA\",\"kid\":\"new\"}",
                        2L,
                        1L,
                        "{\"kty\":\"RSA\",\"kid\":\"identity-new\"}",
                        IDENTITY_KEY_ALGORITHM,
                        ACCOUNT_KEY_ALGORITHM,
                        SIGNED_AT.toString(),
                        "new-signature"
                )
        )).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("Identity signing key cannot be changed by account key rotation");

        verify(userEncryptionAccountKeyRepository, never()).save(any(UserEncryptionAccountKey.class));
    }

    @Test
    void sessionResetOwnIdentityKeyBundleShouldResetWithoutPasswordChallenge() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-10T10:00:00Z");
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                createdAt
        );
        UserEncryptionAccountKey existingAccountKey = new UserEncryptionAccountKey(
                UUID.randomUUID(),
                userId,
                "{\"kty\":\"RSA\",\"kid\":\"old\"}",
                1L,
                "{\"kty\":\"RSA\",\"kid\":\"identity-old\"}",
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                "old-signature",
                createdAt,
                createdAt
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionAccountKeyRepository.findByUserId(userId))
                .thenReturn(Optional.of(existingAccountKey));

        UserEncryptionAccountKeyResponse response = userEncryptionAccountKeyService
                .sessionResetOwnIdentityKeyBundle(
                        "north",
                        "token",
                        new UserEncryptionSessionResetRequest(
                                "{\"kty\":\"RSA\",\"kid\":\"new\"}",
                                1L,
                                2L,
                                "{\"kty\":\"RSA\",\"kid\":\"identity-new\"}",
                                IDENTITY_KEY_ALGORITHM,
                                ACCOUNT_KEY_ALGORITHM,
                                SIGNED_AT.toString(),
                                "new-signature"
                        )
                );

        assertThat(response.publicKey()).isEqualTo("{\"kty\":\"RSA\",\"kid\":\"new\"}");
        assertThat(response.accountKeyVersion()).isEqualTo(1L);
        assertThat(response.identityGeneration()).isEqualTo(2L);
        verify(userEncryptionAccountKeyRepository).save(existingAccountKey);
        verify(eventPublisher).publishEvent(new UserIdentityResetEvent(userId));
        verify(eventPublisher).publishEvent(new UserAccountKeyChangedEvent(userId));
    }
}
