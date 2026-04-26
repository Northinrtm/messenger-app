package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ResolveEncryptionDeviceBundlesRequest;
import com.north.messenger.api.dto.ResolveEncryptionDeviceManifestRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceBundleResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceManifestResponse;
import com.north.messenger.api.dto.UserEncryptionDevicePrekeyResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceResponse;
import com.north.messenger.api.dto.UserEncryptionOneTimePrekeyRequest;
import com.north.messenger.api.dto.EncryptionDeviceManifestKnownDeviceRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionOneTimePrekey;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.model.UserSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionOneTimePrekeyRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class UserEncryptionDeviceService {

    private static final Duration SIGNED_PREKEY_GRACE_PERIOD = Duration.ofHours(24);
    private static final int MIN_ACTIVE_DEVICES_PER_USER = 1;

    private final AuthService authService;
    private final ChatParticipantRepository chatParticipantRepository;
    private final UserSessionRepository userSessionRepository;
    private final UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private final UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository;
    private final UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private final DeviceKeyValidationService deviceKeyValidationService;
    private final int maxActiveDevicesPerUser;

    public UserEncryptionDeviceService(
            AuthService authService,
            ChatParticipantRepository chatParticipantRepository,
            UserSessionRepository userSessionRepository,
            UserEncryptionDeviceRepository userEncryptionDeviceRepository,
            UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository,
            UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository,
            DeviceKeyValidationService deviceKeyValidationService,
            @Value("${app.e2ee.max-active-devices-per-user:8}") int maxActiveDevicesPerUser
    ) {
        this.authService = authService;
        this.chatParticipantRepository = chatParticipantRepository;
        this.userSessionRepository = userSessionRepository;
        this.userEncryptionDeviceRepository = userEncryptionDeviceRepository;
        this.userEncryptionOneTimePrekeyRepository = userEncryptionOneTimePrekeyRepository;
        this.userEncryptionSignedPrekeyRepository = userEncryptionSignedPrekeyRepository;
        this.deviceKeyValidationService = deviceKeyValidationService;
        this.maxActiveDevicesPerUser = Math.max(MIN_ACTIVE_DEVICES_PER_USER, maxActiveDevicesPerUser);
    }

    public List<UserEncryptionDeviceResponse> listOwnDevices(String username) {
        return listOwnDevices(authService.requireAuthenticatedUser(username).getId());
    }

    public List<UserEncryptionDeviceResponse> listOwnDevices(UUID userId) {
        return visibleDevices(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(userId)).stream()
                .map(device -> toDeviceResponse(device, userEncryptionOneTimePrekeyRepository.countByDeviceIdAndClaimedAtIsNull(device.getId())))
                .collect(Collectors.toList());
    }

    @Transactional
    public UserEncryptionDeviceResponse upsertOwnDevice(
            String username,
            String accessToken,
            UserEncryptionDeviceRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession = authService.requireAuthenticatedSession(username, accessToken);
        deviceKeyValidationService.validateDeviceRegistrationRequest(request);
        UserSession session = userSessionRepository.findByIdForUpdate(authenticatedSession.sessionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated session not found"));

        Instant now = Instant.now();
        UserEncryptionDevice device = resolveUpsertTargetDevice(authenticatedSession, session, request, now);
        validatePrekeys(request.oneTimePrekeys(), device.getId());

        userEncryptionDeviceRepository.save(device);
        syncSignedPrekeys(device, request, now);
        userEncryptionOneTimePrekeyRepository.deleteAllUnclaimedByDeviceIdInBulk(device.getId());
        request.oneTimePrekeys().forEach(prekey -> userEncryptionOneTimePrekeyRepository.save(
                new UserEncryptionOneTimePrekey(
                        UUID.randomUUID(),
                        device.getId(),
                        prekey.keyId(),
                        prekey.publicKey(),
                        now,
                        null,
                        null,
                        null,
                        null,
                        null
                )
        ));
        retireExcessActiveDevices(authenticatedSession.user().getId(), device.getId(), now);

        return toDeviceResponse(device, request.oneTimePrekeys().size());
    }

    private void retireExcessActiveDevices(UUID userId, UUID currentDeviceId, Instant retiredAt) {
        List<UserEncryptionDevice> activeDevices =
                userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDescRegisteredAtDesc(userId);
        if (activeDevices.size() <= maxActiveDevicesPerUser) {
            return;
        }

        Set<UUID> retainedDeviceIds = new LinkedHashSet<>();
        retainedDeviceIds.add(currentDeviceId);
        for (UserEncryptionDevice activeDevice : activeDevices) {
            if (retainedDeviceIds.size() >= maxActiveDevicesPerUser) {
                break;
            }
            retainedDeviceIds.add(activeDevice.getId());
        }

        activeDevices.stream()
                .filter(activeDevice -> !retainedDeviceIds.contains(activeDevice.getId()))
                .forEach(activeDevice -> {
                    activeDevice.retire(retiredAt);
                    userEncryptionDeviceRepository.save(activeDevice);
                });
    }

    private UserEncryptionDevice resolveUpsertTargetDevice(
            AuthService.AuthenticatedSession authenticatedSession,
            UserSession session,
            UserEncryptionDeviceRequest request,
            Instant now
    ) {
        UUID requestedDeviceId = request.deviceId();
        if (requestedDeviceId != null) {
            return userEncryptionDeviceRepository.findById(requestedDeviceId)
                    .map(existing -> {
                        if (!existing.getUserId().equals(authenticatedSession.user().getId())) {
                            throw new ResponseStatusException(HttpStatus.CONFLICT, "Encryption device belongs to another user");
                        }
                        existing.register(
                                session.getDeviceName(),
                                request.identityKey(),
                                request.identityKeyAlgorithm(),
                                request.identitySignatureKey(),
                                request.identitySignatureKeyAlgorithm(),
                                request.signedPrekeyId(),
                                request.signedPrekeyPublicKey(),
                                request.signedPrekeySignature(),
                                request.signedPrekeyAlgorithm(),
                                now
                        );
                        return existing;
                    })
                    .orElseGet(() -> new UserEncryptionDevice(
                            requestedDeviceId,
                            authenticatedSession.user().getId(),
                            session.getDeviceName(),
                            request.identityKey(),
                            request.identityKeyAlgorithm(),
                            request.identitySignatureKey(),
                            request.identitySignatureKeyAlgorithm(),
                            request.signedPrekeyId(),
                            request.signedPrekeyPublicKey(),
                            request.signedPrekeySignature(),
                            request.signedPrekeyAlgorithm(),
                            now,
                            now,
                            null
                    ));
        }

        return userEncryptionDeviceRepository.findByUserIdAndIdentityKeyAndIdentitySignatureKeyAndRetiredAtIsNull(
                        authenticatedSession.user().getId(),
                        request.identityKey(),
                        request.identitySignatureKey()
                )
                .map(existing -> {
                    existing.register(
                            session.getDeviceName(),
                            request.identityKey(),
                            request.identityKeyAlgorithm(),
                            request.identitySignatureKey(),
                            request.identitySignatureKeyAlgorithm(),
                            request.signedPrekeyId(),
                            request.signedPrekeyPublicKey(),
                            request.signedPrekeySignature(),
                            request.signedPrekeyAlgorithm(),
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserEncryptionDevice(
                        UUID.randomUUID(),
                        authenticatedSession.user().getId(),
                        session.getDeviceName(),
                        request.identityKey(),
                        request.identityKeyAlgorithm(),
                        request.identitySignatureKey(),
                        request.identitySignatureKeyAlgorithm(),
                        request.signedPrekeyId(),
                        request.signedPrekeyPublicKey(),
                        request.signedPrekeySignature(),
                        request.signedPrekeyAlgorithm(),
                        now,
                        now,
                        null
                ));
    }

    @Transactional
    public List<UserEncryptionDeviceBundleResponse> resolveDeviceBundles(
            String username,
            String accessToken,
            ResolveEncryptionDeviceBundlesRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession = authService.requireAuthenticatedSession(
                username,
                accessToken
        );
        UUID currentUserId = authenticatedSession.user().getId();
        if (request.userIds() == null || request.userIds().isEmpty()) {
            return List.of();
        }
        Set<UUID> requestedUserIds = request.userIds().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (requestedUserIds.isEmpty()) {
            return List.of();
        }
        assertBundleAccess(currentUserId, requestedUserIds);

        Instant now = Instant.now();

        UserEncryptionDevice requesterDevice = null;
        if (Boolean.TRUE.equals(request.consumeOneTimePrekeys())) {
            UUID requesterDeviceId = request.requesterDeviceId();
            if (requesterDeviceId == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Requester device id is required when consuming one-time prekeys"
                );
            }
            requesterDevice = userEncryptionDeviceRepository.findById(requesterDeviceId)
                    .filter(device -> device.getUserId().equals(currentUserId))
                    .filter(device -> device.getRetiredAt() == null)
                    .filter(deviceKeyValidationService::hasValidCurrentSignedPrekey)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Requester device is invalid for one-time prekey consumption"
                    ));
        }

        Set<UUID> requestedDeviceIds = request.deviceIds() == null
                ? Set.of()
                : request.deviceIds().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<UserEncryptionDeviceBundleResponse> bundles = new ArrayList<>();
        boolean consumeOneTimePrekeys = Boolean.TRUE.equals(request.consumeOneTimePrekeys());
        UUID requesterDeviceId = requesterDevice != null ? requesterDevice.getId() : null;
        for (UserEncryptionDevice device : visibleDevices(
                userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.copyOf(requestedUserIds)))
        ) {
            if (!requestedDeviceIds.isEmpty() && !requestedDeviceIds.contains(device.getId())) {
                continue;
            }

            UserEncryptionOneTimePrekey oneTimePrekey = userEncryptionOneTimePrekeyRepository
                    .findFirstByDeviceIdAndClaimedAtIsNullOrderByCreatedAtAsc(device.getId())
                    .map(prekey -> {
                        if (consumeOneTimePrekeys && requesterDeviceId != null) {
                            prekey.claim(now, requesterDeviceId);
                        }
                        return prekey;
                    })
                    .orElse(null);

            bundles.add(toBundleResponse(device, oneTimePrekey));
        }

        return bundles;
    }

    @Transactional
    public UserEncryptionDeviceManifestResponse resolveDeviceManifest(
            String username,
            String accessToken,
            ResolveEncryptionDeviceManifestRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession = authService.requireAuthenticatedSession(
                username,
                accessToken
        );
        UUID currentUserId = authenticatedSession.user().getId();
        Set<UUID> requestedUserIds = normalizeRequestedUserIds(request.userIds());
        if (requestedUserIds.isEmpty()) {
            return new UserEncryptionDeviceManifestResponse(
                    computeManifestVersion(List.of()),
                    true,
                    List.of(),
                    List.of()
            );
        }
        assertBundleAccess(currentUserId, requestedUserIds);

        Set<UUID> requestedDeviceIds = request.deviceIds() == null
                ? Set.of()
                : request.deviceIds().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<UserEncryptionDeviceBundleResponse> currentBundles = visibleDevices(
                userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.copyOf(requestedUserIds))
        ).stream()
                .filter(device -> requestedDeviceIds.isEmpty() || requestedDeviceIds.contains(device.getId()))
                .map(device -> toBundleResponse(device, null))
                .sorted(Comparator
                        .comparing(UserEncryptionDeviceBundleResponse::userId)
                        .thenComparing(UserEncryptionDeviceBundleResponse::deviceId))
                .toList();

        String currentVersion = computeManifestVersion(currentBundles);
        if (request.knownVersion() != null && request.knownVersion().equals(currentVersion)) {
            return new UserEncryptionDeviceManifestResponse(
                    currentVersion,
                    false,
                    List.of(),
                    List.of()
            );
        }

        Map<UUID, String> knownDeviceVersions = normalizeKnownDeviceVersions(request.knownDevices());
        if (knownDeviceVersions.isEmpty()) {
            return new UserEncryptionDeviceManifestResponse(
                    currentVersion,
                    true,
                    currentBundles,
                    List.of()
            );
        }

        Map<UUID, UserEncryptionDeviceBundleResponse> currentBundlesByDeviceId = currentBundles.stream()
                .collect(Collectors.toMap(
                        UserEncryptionDeviceBundleResponse::deviceId,
                        Function.identity(),
                        (left, right) -> right,
                        LinkedHashMap::new
                ));
        List<UserEncryptionDeviceBundleResponse> changedBundles = currentBundles.stream()
                .filter(bundle -> !Objects.equals(
                        knownDeviceVersions.get(bundle.deviceId()),
                        bundle.deviceVersion()
                ))
                .toList();
        List<UUID> removedDeviceIds = knownDeviceVersions.keySet().stream()
                .filter(deviceId -> !currentBundlesByDeviceId.containsKey(deviceId))
                .sorted()
                .toList();

        return new UserEncryptionDeviceManifestResponse(
                currentVersion,
                false,
                changedBundles,
                removedDeviceIds
        );
    }

    private void syncSignedPrekeys(UserEncryptionDevice device, UserEncryptionDeviceRequest request, Instant now) {
        userEncryptionSignedPrekeyRepository.deleteExpiredByDeviceId(device.getId(), now);

        UserEncryptionSignedPrekey existingByKeyId = userEncryptionSignedPrekeyRepository
                .findByDeviceIdAndKeyId(device.getId(), request.signedPrekeyId())
                .orElse(null);
        if (existingByKeyId != null && !existingByKeyId.matches(
                request.signedPrekeyPublicKey(),
                request.signedPrekeySignature(),
                request.signedPrekeyAlgorithm()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Signed prekey ids must not be reused for different key material"
            );
        }
        if (existingByKeyId != null && existingByKeyId.getRetiredAt() != null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Signed prekey ids must not be reused once rotated"
            );
        }

        UserEncryptionSignedPrekey currentPrekey = userEncryptionSignedPrekeyRepository
                .findCurrentByDeviceId(device.getId())
                .orElse(null);
        if (currentPrekey != null
                && currentPrekey.getKeyId() == request.signedPrekeyId()
                && currentPrekey.matches(
                        request.signedPrekeyPublicKey(),
                        request.signedPrekeySignature(),
                        request.signedPrekeyAlgorithm()
                )) {
            return;
        }

        if (currentPrekey != null) {
            currentPrekey.retire(now, now.plus(SIGNED_PREKEY_GRACE_PERIOD));
            userEncryptionSignedPrekeyRepository.save(currentPrekey);
        }

        userEncryptionSignedPrekeyRepository.save(new UserEncryptionSignedPrekey(
                UUID.randomUUID(),
                device.getId(),
                request.signedPrekeyId(),
                request.signedPrekeyPublicKey(),
                request.signedPrekeySignature(),
                request.signedPrekeyAlgorithm(),
                now,
                null,
                null
        ));
    }

    private List<UserEncryptionDevice> visibleDevices(List<UserEncryptionDevice> devices) {
        return devices.stream()
                .filter(deviceKeyValidationService::hasValidCurrentSignedPrekey)
                .toList();
    }

    private void validatePrekeys(List<UserEncryptionOneTimePrekeyRequest> prekeys, UUID deviceId) {
        Set<Integer> keyIds = new LinkedHashSet<>();
        Set<Integer> preservedClaimedKeyIds = new HashSet<>(
                userEncryptionOneTimePrekeyRepository.findAllByDeviceIdAndClaimedAtIsNotNull(deviceId).stream()
                        .map(UserEncryptionOneTimePrekey::getKeyId)
                        .toList()
        );
        for (UserEncryptionOneTimePrekeyRequest prekey : prekeys) {
            if (!keyIds.add(prekey.keyId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One-time prekey ids must be unique per device upload");
            }
            if (preservedClaimedKeyIds.contains(prekey.keyId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "One-time prekey ids must not reuse claimed bootstrap keys"
                );
            }
        }
    }

    private UserEncryptionDeviceResponse toDeviceResponse(UserEncryptionDevice device, long availableOneTimePrekeys) {
        return new UserEncryptionDeviceResponse(
                device.getId(),
                device.getDeviceName(),
                device.getIdentityKey(),
                device.getIdentityKeyAlgorithm(),
                device.getIdentitySignatureKey(),
                device.getIdentitySignatureKeyAlgorithm(),
                device.getSignedPrekeyId(),
                device.getSignedPrekeyPublicKey(),
                device.getSignedPrekeySignature(),
                device.getSignedPrekeyAlgorithm(),
                computeDeviceVersion(device),
                availableOneTimePrekeys,
                device.getRegisteredAt(),
                device.getLastSeenAt()
        );
    }

    private UserEncryptionDeviceBundleResponse toBundleResponse(UserEncryptionDevice device, UserEncryptionOneTimePrekey oneTimePrekey) {
        return new UserEncryptionDeviceBundleResponse(
                device.getUserId(),
                device.getId(),
                null,
                device.getIdentityKey(),
                device.getIdentityKeyAlgorithm(),
                device.getIdentitySignatureKey(),
                device.getIdentitySignatureKeyAlgorithm(),
                device.getSignedPrekeyId(),
                device.getSignedPrekeyPublicKey(),
                device.getSignedPrekeySignature(),
                device.getSignedPrekeyAlgorithm(),
                computeDeviceVersion(device),
                oneTimePrekey != null
                        ? new UserEncryptionDevicePrekeyResponse(oneTimePrekey.getKeyId(), oneTimePrekey.getPublicKey())
                        : null,
                null,
                null
        );
    }

    private Set<UUID> normalizeRequestedUserIds(List<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Set.of();
        }

        return userIds.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Map<UUID, String> normalizeKnownDeviceVersions(
            List<EncryptionDeviceManifestKnownDeviceRequest> knownDevices
    ) {
        if (knownDevices == null || knownDevices.isEmpty()) {
            return Map.of();
        }

        LinkedHashMap<UUID, String> normalizedVersions = new LinkedHashMap<>();
        for (EncryptionDeviceManifestKnownDeviceRequest knownDevice : knownDevices) {
            if (knownDevice == null || knownDevice.deviceId() == null) {
                continue;
            }
            String normalizedVersion = knownDevice.version() == null ? "" : knownDevice.version().trim();
            if (normalizedVersion.isEmpty()) {
                continue;
            }
            normalizedVersions.put(knownDevice.deviceId(), normalizedVersion);
        }
        return normalizedVersions;
    }

    private String computeManifestVersion(List<UserEncryptionDeviceBundleResponse> bundles) {
        String manifestPayload = bundles.stream()
                .sorted(Comparator
                        .comparing(UserEncryptionDeviceBundleResponse::userId)
                        .thenComparing(UserEncryptionDeviceBundleResponse::deviceId))
                .map(bundle -> bundle.userId() + ":" + bundle.deviceId() + ":" + bundle.deviceVersion())
                .collect(Collectors.joining("\n"));
        return sha256Hex(manifestPayload);
    }

    private String computeDeviceVersion(UserEncryptionDevice device) {
        return sha256Hex(String.join(
                "\n",
                device.getUserId().toString(),
                device.getId().toString(),
                device.getIdentityKeyAlgorithm(),
                device.getIdentityKey(),
                device.getIdentitySignatureKeyAlgorithm(),
                device.getIdentitySignatureKey(),
                Integer.toString(device.getSignedPrekeyId()),
                device.getSignedPrekeyAlgorithm(),
                device.getSignedPrekeyPublicKey(),
                device.getSignedPrekeySignature()
        ));
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for device manifest hashing", exception);
        }
    }

    private void assertBundleAccess(UUID currentUserId, Set<UUID> requestedUserIds) {
        LinkedHashSet<UUID> otherUserIds = requestedUserIds.stream()
                .filter(requestedUserId -> !requestedUserId.equals(currentUserId))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (otherUserIds.isEmpty()) {
            return;
        }

        Set<UUID> blockedUserIds = authService.findUsersBlockedEitherDirection(currentUserId, otherUserIds);
        for (UUID requestedUserId : otherUserIds) {
            if (blockedUserIds.contains(requestedUserId)) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Encryption device bundles are unavailable for this user"
                );
            }
        }

        Set<UUID> sharedChatUserIds = chatParticipantRepository.findUserIdsSharingAnyChatWithUser(
                currentUserId,
                otherUserIds
        );
        for (UUID requestedUserId : otherUserIds) {
            if (!sharedChatUserIds.contains(requestedUserId)) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Encryption device bundles are only available for users who share a chat"
                );
            }
        }
    }
}
