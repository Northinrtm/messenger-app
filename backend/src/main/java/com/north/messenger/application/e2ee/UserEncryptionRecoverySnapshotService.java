package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotRequest;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotResponse;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResolveResponse;
import com.north.messenger.api.dto.ResolveEncryptionAccountKeysRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserEncryptionRecoverySnapshot;
import com.north.messenger.domain.repository.UserEncryptionRecoverySnapshotRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class UserEncryptionRecoverySnapshotService {

    private final AuthService authService;
    private final UserEncryptionRecoverySnapshotRepository userEncryptionRecoverySnapshotRepository;

    public UserEncryptionRecoverySnapshotService(
            AuthService authService,
            UserEncryptionRecoverySnapshotRepository userEncryptionRecoverySnapshotRepository
    ) {
        this.authService = authService;
        this.userEncryptionRecoverySnapshotRepository = userEncryptionRecoverySnapshotRepository;
    }

    public UserEncryptionRecoverySnapshotResponse getOwnRecoverySnapshot(String username) {
        UUID userId = authService.requireAuthenticatedUser(username).getId();
        return userEncryptionRecoverySnapshotRepository.findByUserId(userId)
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Encryption recovery snapshot not found"
                ));
    }

    public List<UserEncryptionAccountKeyResolveResponse> resolveAccountPublicKeys(
            String username,
            String accessToken,
            ResolveEncryptionAccountKeysRequest request
    ) {
        authService.requireAuthenticatedSession(username, accessToken);
        return userEncryptionRecoverySnapshotRepository.findAllByUserIdIn(request.userIds()).stream()
                .filter(snapshot -> snapshot.getAccountPublicKey() != null && !snapshot.getAccountPublicKey().isBlank())
                .map(snapshot -> new UserEncryptionAccountKeyResolveResponse(
                        snapshot.getUserId(),
                        snapshot.getAccountPublicKey()
                ))
                .collect(Collectors.toList());
    }

    @Transactional
    public UserEncryptionRecoverySnapshotResponse upsertOwnRecoverySnapshot(
            String username,
            String accessToken,
            UserEncryptionRecoverySnapshotRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession =
                authService.requireAuthenticatedSession(username, accessToken);
        Instant now = Instant.now();

        UserEncryptionRecoverySnapshot snapshot = userEncryptionRecoverySnapshotRepository
                .findByUserId(authenticatedSession.user().getId())
                .map(existing -> {
                    existing.update(
                            request.snapshotPayloadJson(),
                            request.wrappedIdentityRecordJson(),
                            request.accountPublicKey(),
                            authenticatedSession.user().getPasswordVersion(),
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserEncryptionRecoverySnapshot(
                        UUID.randomUUID(),
                        authenticatedSession.user().getId(),
                        request.snapshotPayloadJson(),
                        request.wrappedIdentityRecordJson(),
                        request.accountPublicKey(),
                        authenticatedSession.user().getPasswordVersion(),
                        now,
                        now
                ));

        return toResponse(userEncryptionRecoverySnapshotRepository.save(snapshot));
    }

    private UserEncryptionRecoverySnapshotResponse toResponse(UserEncryptionRecoverySnapshot snapshot) {
        return new UserEncryptionRecoverySnapshotResponse(
                snapshot.getSnapshotPayloadJson(),
                snapshot.getWrappedIdentityRecordJson(),
                snapshot.getAccountPublicKey(),
                snapshot.getWrappedPasswordVersion(),
                snapshot.getCreatedAt(),
                snapshot.getUpdatedAt()
        );
    }
}
