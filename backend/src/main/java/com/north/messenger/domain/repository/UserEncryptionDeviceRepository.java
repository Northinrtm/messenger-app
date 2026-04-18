package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionDevice;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserEncryptionDeviceRepository extends JpaRepository<UserEncryptionDevice, UUID> {

    List<UserEncryptionDevice> findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(UUID userId);

    List<UserEncryptionDevice> findAllByUserIdInAndRetiredAtIsNull(List<UUID> userIds);

    Optional<UserEncryptionDevice> findByUserIdAndIdentityKeyAndIdentitySignatureKeyAndRetiredAtIsNull(
            UUID userId,
            String identityKey,
            String identitySignatureKey
    );
}
