package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.DevicePushToken;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DevicePushTokenRepository extends JpaRepository<DevicePushToken, UUID> {

    Optional<DevicePushToken> findByToken(String token);

    List<DevicePushToken> findAllByUserIdIn(Collection<UUID> userIds);

    void deleteByTokenAndUserId(String token, UUID userId);

    void deleteByToken(String token);
}
