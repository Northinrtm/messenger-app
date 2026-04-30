package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotRequest;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserEncryptionRecoverySnapshot;
import com.north.messenger.domain.repository.UserEncryptionRecoverySnapshotRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserEncryptionRecoverySnapshotServiceTest {

    private AuthService authService;
    private UserEncryptionRecoverySnapshotRepository userEncryptionRecoverySnapshotRepository;
    private UserEncryptionRecoverySnapshotService userEncryptionRecoverySnapshotService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        userEncryptionRecoverySnapshotRepository = mock(UserEncryptionRecoverySnapshotRepository.class);
        userEncryptionRecoverySnapshotService = new UserEncryptionRecoverySnapshotService(
                authService,
                userEncryptionRecoverySnapshotRepository
        );

        when(userEncryptionRecoverySnapshotRepository.save(any(UserEncryptionRecoverySnapshot.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void getOwnRecoverySnapshotShouldReturnExistingSnapshot() {
        UUID userId = UUID.randomUUID();
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserEncryptionRecoverySnapshot snapshot = new UserEncryptionRecoverySnapshot(
                UUID.randomUUID(),
                userId,
                "{\"messages\":[]}",
                "{\"salt\":\"salt\"}",
                "account-public-key",
                1L,
                Instant.parse("2026-04-10T10:00:00Z"),
                Instant.parse("2026-04-10T10:05:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userEncryptionRecoverySnapshotRepository.findByUserId(userId)).thenReturn(Optional.of(snapshot));

        UserEncryptionRecoverySnapshotResponse response =
                userEncryptionRecoverySnapshotService.getOwnRecoverySnapshot("north");

        assertThat(response.snapshotPayloadJson()).isEqualTo("{\"messages\":[]}");
        assertThat(response.wrappedIdentityRecordJson()).isEqualTo("{\"salt\":\"salt\"}");
        assertThat(response.accountPublicKey()).isEqualTo("account-public-key");
        assertThat(response.wrappedPasswordVersion()).isEqualTo(1L);
        assertThat(response.updatedAt()).isEqualTo(Instant.parse("2026-04-10T10:05:00Z"));
    }

    @Test
    void getOwnRecoverySnapshotShouldFailWhenMissing() {
        UUID userId = UUID.randomUUID();
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userEncryptionRecoverySnapshotRepository.findByUserId(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userEncryptionRecoverySnapshotService.getOwnRecoverySnapshot("north"))
                .hasMessageContaining("Encryption recovery snapshot not found");
    }

    @Test
    void upsertOwnRecoverySnapshotShouldCreateSnapshotWhenMissing() {
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
        when(userEncryptionRecoverySnapshotRepository.findByUserId(userId)).thenReturn(Optional.empty());

        UserEncryptionRecoverySnapshotResponse response =
                userEncryptionRecoverySnapshotService.upsertOwnRecoverySnapshot(
                        "north",
                        "token",
                        new UserEncryptionRecoverySnapshotRequest(
                                "{\"messages\":[1]}",
                                "{\"salt\":\"next\"}",
                                "account-public-key"
                        )
                );

        assertThat(response.snapshotPayloadJson()).isEqualTo("{\"messages\":[1]}");
        assertThat(response.wrappedIdentityRecordJson()).isEqualTo("{\"salt\":\"next\"}");
        assertThat(response.accountPublicKey()).isEqualTo("account-public-key");
        assertThat(response.wrappedPasswordVersion()).isEqualTo(user.getPasswordVersion());
        verify(userEncryptionRecoverySnapshotRepository).save(any(UserEncryptionRecoverySnapshot.class));
    }

    @Test
    void upsertOwnRecoverySnapshotShouldUpdateExistingSnapshot() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        var user = testUserAccount(
                userId,
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserEncryptionRecoverySnapshot existingSnapshot = new UserEncryptionRecoverySnapshot(
                UUID.randomUUID(),
                userId,
                "{\"messages\":[]}",
                "{\"salt\":\"old\"}",
                "account-public-key-old",
                1L,
                Instant.parse("2026-04-10T10:00:00Z"),
                Instant.parse("2026-04-10T10:05:00Z")
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userEncryptionRecoverySnapshotRepository.findByUserId(userId))
                .thenReturn(Optional.of(existingSnapshot));

        UserEncryptionRecoverySnapshotResponse response =
                userEncryptionRecoverySnapshotService.upsertOwnRecoverySnapshot(
                        "north",
                        "token",
                        new UserEncryptionRecoverySnapshotRequest(
                                "{\"messages\":[2]}",
                                "{\"salt\":\"new\"}",
                                "account-public-key-new"
                        )
                );

        assertThat(response.snapshotPayloadJson()).isEqualTo("{\"messages\":[2]}");
        assertThat(response.wrappedIdentityRecordJson()).isEqualTo("{\"salt\":\"new\"}");
        assertThat(response.accountPublicKey()).isEqualTo("account-public-key-new");
        assertThat(response.wrappedPasswordVersion()).isEqualTo(user.getPasswordVersion());
        assertThat(existingSnapshot.getSnapshotPayloadJson()).isEqualTo("{\"messages\":[2]}");
        assertThat(existingSnapshot.getWrappedIdentityRecordJson()).isEqualTo("{\"salt\":\"new\"}");
        assertThat(existingSnapshot.getAccountPublicKey()).isEqualTo("account-public-key-new");
        assertThat(existingSnapshot.getWrappedPasswordVersion()).isEqualTo(user.getPasswordVersion());
        verify(userEncryptionRecoverySnapshotRepository).save(existingSnapshot);
    }
}
