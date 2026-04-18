package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionOneTimePrekey;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserEncryptionOneTimePrekeyRepository extends JpaRepository<UserEncryptionOneTimePrekey, UUID> {

    void deleteAllByDeviceId(UUID deviceId);

    void deleteAllByDeviceIdIn(Collection<UUID> deviceIds);

    @Modifying(flushAutomatically = true)
    @Query("""
            delete
            from UserEncryptionOneTimePrekey prekey
            where prekey.deviceId = :deviceId
            """)
    int deleteAllByDeviceIdInBulk(@Param("deviceId") UUID deviceId);

    @Modifying(flushAutomatically = true)
    @Query("""
            delete
            from UserEncryptionOneTimePrekey prekey
            where prekey.deviceId = :deviceId
              and prekey.claimedAt is null
            """)
    int deleteAllUnclaimedByDeviceIdInBulk(@Param("deviceId") UUID deviceId);

    Optional<UserEncryptionOneTimePrekey> findByDeviceIdAndKeyId(UUID deviceId, int keyId);

    java.util.List<UserEncryptionOneTimePrekey> findAllByDeviceIdAndClaimedAtIsNotNull(UUID deviceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserEncryptionOneTimePrekey> findFirstByDeviceIdAndClaimedAtIsNullOrderByCreatedAtAsc(UUID deviceId);

    long countByDeviceIdAndClaimedAtIsNull(UUID deviceId);
}
