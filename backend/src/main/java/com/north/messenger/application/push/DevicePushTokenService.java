package com.north.messenger.application.push;

import com.north.messenger.domain.model.DevicePushToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.DevicePushTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DevicePushTokenService {

    private final DevicePushTokenRepository repository;
    private final UserAccountRepository userAccountRepository;

    public DevicePushTokenService(
            DevicePushTokenRepository repository,
            UserAccountRepository userAccountRepository
    ) {
        this.repository = repository;
        this.userAccountRepository = userAccountRepository;
    }

    @Transactional
    public void registerToken(String username, String token, String platform) {
        UUID userId = requireUserId(username);
        Instant now = Instant.now();
        Optional<DevicePushToken> existing = repository.findByToken(token);
        if (existing.isPresent()) {
            existing.get().touch(userId, now);
        } else {
            repository.save(new DevicePushToken(UUID.randomUUID(), userId, token, platform, now));
        }
    }

    @Transactional
    public void unregisterToken(String username, String token) {
        UUID userId = requireUserId(username);
        repository.deleteByTokenAndUserId(token, userId);
    }

    @Transactional
    public void removeInvalidToken(String token) {
        repository.deleteByToken(token);
    }

    private UUID requireUserId(String username) {
        return userAccountRepository.findByUsernameIgnoreCase(username)
                .map(UserAccount::getId)
                .orElseThrow(() -> new IllegalStateException("User not found: " + username));
    }
}
