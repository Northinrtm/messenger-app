package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionKey;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserEncryptionKeyRepository extends JpaRepository<UserEncryptionKey, UUID> {

    List<UserEncryptionKey> findAllByUserIdIn(Collection<UUID> userIds);
}
