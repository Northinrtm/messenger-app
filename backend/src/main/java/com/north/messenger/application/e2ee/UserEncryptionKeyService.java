package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ResolveEncryptionKeysRequest;
import com.north.messenger.api.dto.UserEncryptionKeyBundleRequest;
import com.north.messenger.api.dto.UserEncryptionKeyBundleResponse;
import com.north.messenger.api.dto.UserEncryptionPublicKeyResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionKey;
import com.north.messenger.domain.repository.UserEncryptionKeyRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class UserEncryptionKeyService {

    private final AuthService authService;
    private final UserEncryptionKeyRepository userEncryptionKeyRepository;

    public UserEncryptionKeyService(
            AuthService authService,
            UserEncryptionKeyRepository userEncryptionKeyRepository
    ) {
        this.authService = authService;
        this.userEncryptionKeyRepository = userEncryptionKeyRepository;
    }

    public UserEncryptionKeyBundleResponse getOwnBundle(String username) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        UserEncryptionKey key = userEncryptionKeyRepository.findById(user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Encryption key bundle not found"));
        return toBundleResponse(key);
    }

    @Transactional
    public UserEncryptionKeyBundleResponse upsertOwnBundle(String username, UserEncryptionKeyBundleRequest request) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        Instant now = Instant.now();

        UserEncryptionKey key = userEncryptionKeyRepository.findById(user.getId())
                .map(existing -> {
                    existing.update(
                            request.publicKey(),
                            request.encryptedPrivateKey(),
                            request.kdfSalt(),
                            request.kdfIv(),
                            request.kdfIterations(),
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserEncryptionKey(
                        user.getId(),
                        request.publicKey(),
                        request.encryptedPrivateKey(),
                        request.kdfSalt(),
                        request.kdfIv(),
                        request.kdfIterations(),
                        now,
                        now
                ));

        userEncryptionKeyRepository.save(key);
        return toBundleResponse(key);
    }

    public List<UserEncryptionPublicKeyResponse> resolvePublicKeys(String username, ResolveEncryptionKeysRequest request) {
        authService.requireAuthenticatedUser(username);
        return resolvePublicKeys(request.userIds());
    }

    public List<UserEncryptionPublicKeyResponse> resolvePublicKeys(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }

        return userEncryptionKeyRepository.findAllByUserIdIn(userIds).stream()
                .map(key -> new UserEncryptionPublicKeyResponse(key.getUserId(), key.getPublicKey()))
                .toList();
    }

    private UserEncryptionKeyBundleResponse toBundleResponse(UserEncryptionKey key) {
        return new UserEncryptionKeyBundleResponse(
                key.getUserId(),
                key.getPublicKey(),
                key.getEncryptedPrivateKey(),
                key.getKdfSalt(),
                key.getKdfIv(),
                key.getKdfIterations(),
                key.getCreatedAt(),
                key.getUpdatedAt()
        );
    }
}
