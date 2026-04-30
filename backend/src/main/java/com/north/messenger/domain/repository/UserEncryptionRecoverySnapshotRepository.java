package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionRecoverySnapshot;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserEncryptionRecoverySnapshotRepository extends JpaRepository<UserEncryptionRecoverySnapshot, UUID> {

    Optional<UserEncryptionRecoverySnapshot> findByUserId(UUID userId);

    List<UserEncryptionRecoverySnapshot> findAllByUserIdIn(List<UUID> userIds);
}
