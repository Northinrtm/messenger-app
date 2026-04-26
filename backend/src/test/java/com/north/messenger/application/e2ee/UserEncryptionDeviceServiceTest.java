package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ResolveEncryptionDeviceBundlesRequest;
import com.north.messenger.api.dto.ResolveEncryptionDeviceManifestRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceBundleResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceManifestResponse;
import com.north.messenger.api.dto.UserEncryptionOneTimePrekeyRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionOneTimePrekey;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionOneTimePrekeyRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserEncryptionDeviceServiceTest {

    private AuthService authService;
    private ChatParticipantRepository chatParticipantRepository;
    private UserSessionRepository userSessionRepository;
    private UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository;
    private UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private UserEncryptionDeviceService userEncryptionDeviceService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userSessionRepository = mock(UserSessionRepository.class);
        userEncryptionDeviceRepository = mock(UserEncryptionDeviceRepository.class);
        userEncryptionOneTimePrekeyRepository = mock(UserEncryptionOneTimePrekeyRepository.class);
        userEncryptionSignedPrekeyRepository = mock(UserEncryptionSignedPrekeyRepository.class);
        userEncryptionDeviceService = new UserEncryptionDeviceService(
                authService,
                chatParticipantRepository,
                userSessionRepository,
                userEncryptionDeviceRepository,
                userEncryptionOneTimePrekeyRepository,
                userEncryptionSignedPrekeyRepository,
                new DeviceKeyValidationService(new ObjectMapper()),
                8
        );

        when(userEncryptionDeviceRepository.save(any(UserEncryptionDevice.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDescRegisteredAtDesc(any(UUID.class)))
                .thenReturn(List.of());
        when(userEncryptionSignedPrekeyRepository.save(any(UserEncryptionSignedPrekey.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(userEncryptionOneTimePrekeyRepository.findAllByDeviceIdAndClaimedAtIsNotNull(any(UUID.class)))
                .thenReturn(List.of());
        when(userEncryptionSignedPrekeyRepository.findCurrentByDeviceId(any(UUID.class)))
                .thenReturn(Optional.empty());
        when(userEncryptionSignedPrekeyRepository.findByDeviceIdAndKeyId(any(UUID.class), anyInt()))
                .thenReturn(Optional.empty());
    }

    @Test
    void upsertOwnDeviceShouldRejectInvalidSignedPrekeySignature() throws Exception {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userSessionRepository.findByIdForUpdate(sessionId))
                .thenReturn(Optional.of(session(sessionId, user.getId())));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                null,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                "tampered-signature",
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        assertThatThrownBy(() -> userEncryptionDeviceService.upsertOwnDevice("north", "token", request))
                .hasMessageContaining("Encryption device signed prekey signature is invalid");
        verify(userEncryptionDeviceRepository, never()).save(any(UserEncryptionDevice.class));
    }

    @Test
    void upsertOwnDeviceShouldAcceptValidDeviceBundle() throws Exception {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userSessionRepository.findByIdForUpdate(sessionId))
                .thenReturn(Optional.of(session(sessionId, user.getId())));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        when(userEncryptionDeviceRepository.findByUserIdAndIdentityKeyAndIdentitySignatureKeyAndRetiredAtIsNull(
                user.getId(),
                material.identityKey(),
                material.identitySignatureKey()
        )).thenReturn(Optional.empty());
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                null,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                material.signedPrekeySignature(),
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        assertThat(userEncryptionDeviceService.upsertOwnDevice("north", "token", request).deviceId())
                .isNotNull();
        verify(userSessionRepository).findByIdForUpdate(sessionId);
        verify(userEncryptionDeviceRepository).save(any(UserEncryptionDevice.class));
        verify(userEncryptionOneTimePrekeyRepository).deleteAllUnclaimedByDeviceIdInBulk(any(UUID.class));
    }

    @Test
    void upsertOwnDeviceShouldRetireOldActiveDevicesOverLimit() throws Exception {
        userEncryptionDeviceService = new UserEncryptionDeviceService(
                authService,
                chatParticipantRepository,
                userSessionRepository,
                userEncryptionDeviceRepository,
                userEncryptionOneTimePrekeyRepository,
                userEncryptionSignedPrekeyRepository,
                new DeviceKeyValidationService(new ObjectMapper()),
                3
        );
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userSessionRepository.findByIdForUpdate(sessionId))
                .thenReturn(Optional.of(session(sessionId, user.getId())));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        when(userEncryptionDeviceRepository.findByUserIdAndIdentityKeyAndIdentitySignatureKeyAndRetiredAtIsNull(
                user.getId(),
                material.identityKey(),
                material.identitySignatureKey()
        )).thenReturn(Optional.empty());

        UserEncryptionDevice recentDevice = device(user.getId());
        UserEncryptionDevice middleDevice = device(user.getId());
        UserEncryptionDevice oldDevice = device(user.getId());
        AtomicReference<UserEncryptionDevice> currentDevice = new AtomicReference<>();
        when(userEncryptionDeviceRepository.save(any(UserEncryptionDevice.class)))
                .thenAnswer(invocation -> {
                    UserEncryptionDevice savedDevice = invocation.getArgument(0);
                    if (savedDevice.getUserId().equals(user.getId())
                            && savedDevice.getIdentityKey().equals(material.identityKey())) {
                        currentDevice.set(savedDevice);
                    }
                    return savedDevice;
                });
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDescRegisteredAtDesc(user.getId()))
                .thenAnswer(invocation -> List.of(currentDevice.get(), recentDevice, middleDevice, oldDevice));

        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                null,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                material.signedPrekeySignature(),
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        userEncryptionDeviceService.upsertOwnDevice("north", "token", request);

        assertThat(currentDevice.get()).isNotNull();
        assertThat(currentDevice.get().getRetiredAt()).isNull();
        assertThat(recentDevice.getRetiredAt()).isNull();
        assertThat(middleDevice.getRetiredAt()).isNull();
        assertThat(oldDevice.getRetiredAt()).isNotNull();
    }

    @Test
    void upsertOwnDeviceShouldReuseRequestedDeviceAcrossNewSession() throws Exception {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID previousSessionId = UUID.randomUUID();
        UUID currentSessionId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UserEncryptionDevice existingDevice = new UserEncryptionDevice(
                deviceId,
                user.getId(),
                "Desktop",
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"identity\"}",
                "X25519",
                "{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"signature\"}",
                "Ed25519",
                7,
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"signed\"}",
                "signature",
                "X25519",
                Instant.parse("2026-04-10T10:00:00Z"),
                Instant.parse("2026-04-10T10:00:00Z"),
                null
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, currentSessionId));
        when(userSessionRepository.findByIdForUpdate(currentSessionId))
                .thenReturn(Optional.of(session(currentSessionId, user.getId())));
        when(userEncryptionDeviceRepository.findById(deviceId)).thenReturn(Optional.of(existingDevice));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                deviceId,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                material.signedPrekeySignature(),
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        UserEncryptionDeviceResponse response = userEncryptionDeviceService.upsertOwnDevice("north", "token", request);

        assertThat(response.deviceId()).isEqualTo(deviceId);
        verify(userEncryptionDeviceRepository).save(existingDevice);
        verify(userEncryptionOneTimePrekeyRepository).deleteAllUnclaimedByDeviceIdInBulk(deviceId);
    }

    @Test
    void upsertOwnDeviceShouldPreserveClaimedBootstrapPrekeys() throws Exception {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UserEncryptionDevice existingDevice = new UserEncryptionDevice(
                deviceId,
                user.getId(),
                "Desktop",
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"identity\"}",
                "X25519",
                "{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"signature\"}",
                "Ed25519",
                7,
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"signed\"}",
                "signature",
                "X25519",
                Instant.parse("2026-04-10T10:00:00Z"),
                Instant.parse("2026-04-10T10:00:00Z"),
                null
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userSessionRepository.findByIdForUpdate(sessionId))
                .thenReturn(Optional.of(session(sessionId, user.getId())));
        when(userEncryptionDeviceRepository.findById(deviceId)).thenReturn(Optional.of(existingDevice));
        when(userEncryptionOneTimePrekeyRepository.findAllByDeviceIdAndClaimedAtIsNotNull(deviceId))
                .thenReturn(List.of(new UserEncryptionOneTimePrekey(
                        UUID.randomUUID(),
                        deviceId,
                        77,
                        "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"claimed\"}",
                        Instant.parse("2026-04-10T10:00:00Z"),
                        Instant.parse("2026-04-10T10:01:00Z"),
                        UUID.randomUUID(),
                        null,
                        null,
                        null
                )));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                deviceId,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                material.signedPrekeySignature(),
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        userEncryptionDeviceService.upsertOwnDevice("north", "token", request);

        verify(userEncryptionOneTimePrekeyRepository).deleteAllUnclaimedByDeviceIdInBulk(deviceId);
        verify(userEncryptionOneTimePrekeyRepository, never()).deleteAllByDeviceIdInBulk(deviceId);
    }

    @Test
    void upsertOwnDeviceShouldRejectRequestedPrekeysThatReuseClaimedBootstrapIds() throws Exception {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(user, sessionId));
        when(userSessionRepository.findByIdForUpdate(sessionId))
                .thenReturn(Optional.of(session(sessionId, user.getId())));

        DeviceRequestMaterial material = generateValidDeviceRequestMaterial();
        when(userEncryptionDeviceRepository.findByUserIdAndIdentityKeyAndIdentitySignatureKeyAndRetiredAtIsNull(
                user.getId(),
                material.identityKey(),
                material.identitySignatureKey()
        )).thenReturn(Optional.empty());
        when(userEncryptionOneTimePrekeyRepository.findAllByDeviceIdAndClaimedAtIsNotNull(any(UUID.class)))
                .thenReturn(List.of(new UserEncryptionOneTimePrekey(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        21,
                        "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"claimed\"}",
                        Instant.parse("2026-04-10T10:00:00Z"),
                        Instant.parse("2026-04-10T10:01:00Z"),
                        UUID.randomUUID(),
                        null,
                        null,
                        null
                )));

        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                null,
                material.identityKey(),
                "X25519",
                material.identitySignatureKey(),
                "Ed25519",
                7,
                material.signedPrekeyPublicKey(),
                material.signedPrekeySignature(),
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(21, material.oneTimePrekeyPublicKey()))
        );

        assertThatThrownBy(() -> userEncryptionDeviceService.upsertOwnDevice("north", "token", request))
                .hasMessageContaining("One-time prekey ids must not reuse claimed bootstrap keys");
        verify(userEncryptionOneTimePrekeyRepository, never()).deleteAllUnclaimedByDeviceIdInBulk(any(UUID.class));
    }

    @Test
    void listOwnDevicesShouldReturnDevicesWithoutSessionFiltering() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserEncryptionDevice device = device(user.getId());
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(user.getId()))
                .thenReturn(List.of(device));
        when(userEncryptionOneTimePrekeyRepository.countByDeviceIdAndClaimedAtIsNull(device.getId()))
                .thenReturn(4L);

        List<UserEncryptionDeviceResponse> response = userEncryptionDeviceService.listOwnDevices(user.getId());

        assertThat(response).hasSize(1);
        assertThat(response.get(0).deviceId()).isEqualTo(device.getId());
    }

    @Test
    void listOwnDevicesShouldHideDevicesWithInvalidCurrentSignedPrekey() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserEncryptionDevice validDevice = device(user.getId());
        UserEncryptionDevice invalidDevice = new UserEncryptionDevice(
                UUID.randomUUID(),
                user.getId(),
                "Legacy desktop",
                validDevice.getIdentityKey(),
                "X25519",
                validDevice.getIdentitySignatureKey(),
                "Ed25519",
                8,
                validDevice.getSignedPrekeyPublicKey(),
                "legacy-signature",
                "X25519",
                Instant.parse("2026-04-10T10:00:00Z"),
                Instant.parse("2026-04-10T10:00:00Z"),
                null
        );
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(user.getId()))
                .thenReturn(List.of(validDevice, invalidDevice));
        when(userEncryptionOneTimePrekeyRepository.countByDeviceIdAndClaimedAtIsNull(validDevice.getId()))
                .thenReturn(4L);

        List<UserEncryptionDeviceResponse> response = userEncryptionDeviceService.listOwnDevices(user.getId());

        assertThat(response).hasSize(1);
        assertThat(response.get(0).deviceId()).isEqualTo(validDevice.getId());
    }

    @Test
    void resolveDeviceBundlesShouldReturnDevicesForUsersWhoShareAChat() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();
        UserEncryptionDevice remoteDevice = device(remoteUser.getId());

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());
        when(chatParticipantRepository.findUserIdsSharingAnyChatWithUser(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of(remoteUser.getId()));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(remoteUser.getId())))
                .thenReturn(List.of(remoteDevice));
        when(userEncryptionOneTimePrekeyRepository.findFirstByDeviceIdAndClaimedAtIsNullOrderByCreatedAtAsc(remoteDevice.getId()))
                .thenReturn(Optional.of(new UserEncryptionOneTimePrekey(
                        UUID.randomUUID(),
                        remoteDevice.getId(),
                        21,
                        "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"otp\"}",
                        Instant.parse("2026-04-10T10:00:00Z"),
                        null,
                        null,
                        null,
                        null,
                        null
                )));

        List<UserEncryptionDeviceBundleResponse> bundles = userEncryptionDeviceService.resolveDeviceBundles(
                "north",
                "token",
                new ResolveEncryptionDeviceBundlesRequest(
                        List.of(remoteUser.getId()),
                        null,
                        false,
                        null
                )
        );

        assertThat(bundles).hasSize(1);
        assertThat(bundles.get(0).deviceId()).isEqualTo(remoteDevice.getId());
        assertThat(bundles.get(0).userId()).isEqualTo(remoteUser.getId());
        assertThat(bundles.get(0).deviceName()).isNull();
        assertThat(bundles.get(0).deviceVersion()).isNotBlank();
        assertThat(bundles.get(0).registeredAt()).isNull();
        assertThat(bundles.get(0).lastSeenAt()).isNull();
    }

    @Test
    void resolveDeviceManifestShouldReturnFullSyncForFirstRead() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();
        UserEncryptionDevice remoteDevice = device(remoteUser.getId());

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());
        when(chatParticipantRepository.findUserIdsSharingAnyChatWithUser(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of(remoteUser.getId()));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(remoteUser.getId())))
                .thenReturn(List.of(remoteDevice));

        UserEncryptionDeviceManifestResponse manifest = userEncryptionDeviceService.resolveDeviceManifest(
                "north",
                "token",
                new ResolveEncryptionDeviceManifestRequest(
                        List.of(remoteUser.getId()),
                        null,
                        null,
                        null
                )
        );

        assertThat(manifest.fullSync()).isTrue();
        assertThat(manifest.version()).isNotBlank();
        assertThat(manifest.bundles()).hasSize(1);
        assertThat(manifest.bundles().get(0).deviceId()).isEqualTo(remoteDevice.getId());
        assertThat(manifest.bundles().get(0).deviceVersion()).isNotBlank();
        assertThat(manifest.removedDeviceIds()).isEmpty();
    }

    @Test
    void resolveDeviceManifestShouldReturnOnlyChangedAndRemovedDevicesForDeltaReads() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();
        UserEncryptionDevice remoteDevice = device(remoteUser.getId());

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());
        when(chatParticipantRepository.findUserIdsSharingAnyChatWithUser(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of(remoteUser.getId()));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(remoteUser.getId())))
                .thenReturn(List.of(remoteDevice));

        UserEncryptionDeviceManifestResponse initialManifest = userEncryptionDeviceService.resolveDeviceManifest(
                "north",
                "token",
                new ResolveEncryptionDeviceManifestRequest(
                        List.of(remoteUser.getId()),
                        null,
                        null,
                        null
                )
        );

        UserEncryptionDeviceManifestResponse unchangedManifest = userEncryptionDeviceService.resolveDeviceManifest(
                "north",
                "token",
                new ResolveEncryptionDeviceManifestRequest(
                        List.of(remoteUser.getId()),
                        null,
                        List.of(new com.north.messenger.api.dto.EncryptionDeviceManifestKnownDeviceRequest(
                                remoteDevice.getId(),
                                initialManifest.bundles().get(0).deviceVersion()
                        )),
                        initialManifest.version()
                )
        );

        assertThat(unchangedManifest.fullSync()).isFalse();
        assertThat(unchangedManifest.bundles()).isEmpty();
        assertThat(unchangedManifest.removedDeviceIds()).isEmpty();

        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(remoteUser.getId())))
                .thenReturn(List.of());

        UserEncryptionDeviceManifestResponse removedManifest = userEncryptionDeviceService.resolveDeviceManifest(
                "north",
                "token",
                new ResolveEncryptionDeviceManifestRequest(
                        List.of(remoteUser.getId()),
                        null,
                        List.of(new com.north.messenger.api.dto.EncryptionDeviceManifestKnownDeviceRequest(
                                remoteDevice.getId(),
                                initialManifest.bundles().get(0).deviceVersion()
                        )),
                        initialManifest.version()
                )
        );

        assertThat(removedManifest.fullSync()).isFalse();
        assertThat(removedManifest.bundles()).isEmpty();
        assertThat(removedManifest.removedDeviceIds()).containsExactly(remoteDevice.getId());
    }

    @Test
    void resolveDeviceBundlesShouldRejectUsersWithoutSharedChat() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());
        when(chatParticipantRepository.findUserIdsSharingAnyChatWithUser(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());

        assertThatThrownBy(() -> userEncryptionDeviceService.resolveDeviceBundles(
                "north",
                "token",
                new ResolveEncryptionDeviceBundlesRequest(
                        List.of(remoteUser.getId()),
                        null,
                        false,
                        null
                )
        )).hasMessageContaining("only available for users who share a chat");

        verify(userEncryptionDeviceRepository, never()).findAllByUserIdInAndRetiredAtIsNull(any());
    }

    @Test
    void resolveDeviceBundlesShouldClaimOneTimePrekeyForRequesterDeviceWhenConsumptionIsRequested() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();
        UserEncryptionDevice requesterDevice = device(currentUser.getId());
        UserEncryptionDevice remoteDevice = device(remoteUser.getId());
        UserEncryptionOneTimePrekey remotePrekey = new UserEncryptionOneTimePrekey(
                UUID.randomUUID(),
                remoteDevice.getId(),
                21,
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"otp\"}",
                Instant.parse("2026-04-10T10:00:00Z"),
                null,
                null,
                null,
                null,
                null
        );

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of());
        when(chatParticipantRepository.findUserIdsSharingAnyChatWithUser(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of(remoteUser.getId()));
        when(userEncryptionDeviceRepository.findById(requesterDevice.getId())).thenReturn(Optional.of(requesterDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(remoteUser.getId())))
                .thenReturn(List.of(remoteDevice));
        when(userEncryptionOneTimePrekeyRepository.findFirstByDeviceIdAndClaimedAtIsNullOrderByCreatedAtAsc(remoteDevice.getId()))
                .thenReturn(Optional.of(remotePrekey));

        List<UserEncryptionDeviceBundleResponse> bundles = userEncryptionDeviceService.resolveDeviceBundles(
                "north",
                "token",
                new ResolveEncryptionDeviceBundlesRequest(
                        List.of(remoteUser.getId()),
                        List.of(remoteDevice.getId()),
                        true,
                        requesterDevice.getId()
                )
        );

        assertThat(bundles).hasSize(1);
        assertThat(bundles.get(0).oneTimePrekey()).isNotNull();
        assertThat(remotePrekey.getClaimedAt()).isNotNull();
        assertThat(remotePrekey.getClaimedBySenderDeviceId()).isEqualTo(requesterDevice.getId());
    }

    @Test
    void resolveDeviceBundlesShouldRejectBlockedUsersBeforeLoadingBundles() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UserAccount remoteUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-10T10:00:00Z")
        );
        UUID currentSessionId = UUID.randomUUID();

        when(authService.requireAuthenticatedSession("north", "token"))
                .thenReturn(new AuthService.AuthenticatedSession(currentUser, currentSessionId));
        when(authService.findUsersBlockedEitherDirection(currentUser.getId(), Set.of(remoteUser.getId())))
                .thenReturn(Set.of(remoteUser.getId()));

        assertThatThrownBy(() -> userEncryptionDeviceService.resolveDeviceBundles(
                "north",
                "token",
                new ResolveEncryptionDeviceBundlesRequest(
                        List.of(remoteUser.getId()),
                        null,
                        false,
                        null
                )
        )).hasMessageContaining("unavailable for this user");

        verify(chatParticipantRepository, never()).findUserIdsSharingAnyChatWithUser(any(UUID.class), any());
        verify(userEncryptionDeviceRepository, never()).findAllByUserIdInAndRetiredAtIsNull(any());
    }

    private DeviceRequestMaterial generateValidDeviceRequestMaterial() throws Exception {
        KeyPairGenerator agreementKeyGenerator = KeyPairGenerator.getInstance("X25519");
        KeyPairGenerator signatureKeyGenerator = KeyPairGenerator.getInstance("Ed25519");
        KeyPair identityKeyPair = agreementKeyGenerator.generateKeyPair();
        KeyPair identitySignatureKeyPair = signatureKeyGenerator.generateKeyPair();
        KeyPair signedPrekeyPair = agreementKeyGenerator.generateKeyPair();
        KeyPair oneTimePrekeyPair = agreementKeyGenerator.generateKeyPair();

        String signedPrekeyPublicKey = x25519PublicJwk(signedPrekeyPair);
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(identitySignatureKeyPair.getPrivate());
        signer.update(signedPrekeySignaturePayload(rawPublicKeyBytes(signedPrekeyPair)));

        return new DeviceRequestMaterial(
                x25519PublicJwk(identityKeyPair),
                ed25519PublicJwk(identitySignatureKeyPair),
                signedPrekeyPublicKey,
                Base64.getEncoder().encodeToString(signer.sign()),
                x25519PublicJwk(oneTimePrekeyPair)
        );
    }

    private String x25519PublicJwk(KeyPair keyPair) {
        return """
                {"kty":"OKP","crv":"X25519","x":"%s"}
                """.formatted(rawPublicKey(keyPair))
                .replace("\n", "")
                .trim();
    }

    private String ed25519PublicJwk(KeyPair keyPair) {
        return """
                {"kty":"OKP","crv":"Ed25519","x":"%s"}
                """.formatted(rawPublicKey(keyPair))
                .replace("\n", "")
                .trim();
    }

    private String rawPublicKey(KeyPair keyPair) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(rawPublicKeyBytes(keyPair));
    }

    private byte[] rawPublicKeyBytes(KeyPair keyPair) {
        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] raw = new byte[32];
        System.arraycopy(encoded, encoded.length - raw.length, raw, 0, raw.length);
        return raw;
    }

    private byte[] signedPrekeySignaturePayload(byte[] rawPublicKey) {
        byte[] context = "north-signed-prekey-v1".getBytes(StandardCharsets.UTF_8);
        byte[] payload = new byte[context.length + 1 + rawPublicKey.length];
        System.arraycopy(context, 0, payload, 0, context.length);
        payload[context.length] = 0;
        System.arraycopy(rawPublicKey, 0, payload, context.length + 1, rawPublicKey.length);
        return payload;
    }

    private UserSession session(UUID sessionId, UUID userId) {
        Instant now = Instant.parse("2026-04-10T10:00:00Z");
        return new UserSession(
                sessionId,
                userId,
                "token-hash",
                now,
                now,
                now.plusSeconds(3600),
                "Desktop",
                null
        );
    }

    private UserEncryptionDevice device(UUID userId) {
        try {
            Instant now = Instant.parse("2026-04-10T10:00:00Z");
            KeyPairGenerator agreementKeyGenerator = KeyPairGenerator.getInstance("X25519");
            KeyPairGenerator signatureKeyGenerator = KeyPairGenerator.getInstance("Ed25519");
            KeyPair identityKeyPair = agreementKeyGenerator.generateKeyPair();
            KeyPair identitySignatureKeyPair = signatureKeyGenerator.generateKeyPair();
            KeyPair signedPrekeyPair = agreementKeyGenerator.generateKeyPair();
            String signedPrekeyPublicKey = x25519PublicJwk(signedPrekeyPair);
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(identitySignatureKeyPair.getPrivate());
            signer.update(signedPrekeySignaturePayload(rawPublicKeyBytes(signedPrekeyPair)));
            return new UserEncryptionDevice(
                    UUID.randomUUID(),
                    userId,
                    "Desktop",
                    x25519PublicJwk(identityKeyPair),
                    "X25519",
                    ed25519PublicJwk(identitySignatureKeyPair),
                    "Ed25519",
                    7,
                    signedPrekeyPublicKey,
                    Base64.getEncoder().encodeToString(signer.sign()),
                    "X25519",
                    now,
                    now,
                    null
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to create valid test device", exception);
        }
    }

    private record DeviceRequestMaterial(
            String identityKey,
            String identitySignatureKey,
            String signedPrekeyPublicKey,
            String signedPrekeySignature,
            String oneTimePrekeyPublicKey
    ) {
    }
}
