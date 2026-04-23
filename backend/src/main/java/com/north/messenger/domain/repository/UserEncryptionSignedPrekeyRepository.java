package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserEncryptionSignedPrekeyRepository extends JpaRepository<UserEncryptionSignedPrekey, UUID> {

    Optional<UserEncryptionSignedPrekey> findByDeviceIdAndKeyId(UUID deviceId, int keyId);

    @Query("""
            select prekey
            from UserEncryptionSignedPrekey prekey
            where prekey.deviceId = :deviceId
              and prekey.retiredAt is null
            """)
    Optional<UserEncryptionSignedPrekey> findCurrentByDeviceId(@Param("deviceId") UUID deviceId);

    @Query("""
            select prekey
            from UserEncryptionSignedPrekey prekey
            where prekey.deviceId = :deviceId
              and prekey.keyId = :keyId
              and (prekey.retiredAt is null or prekey.expiresAt > :now)
            """)
    Optional<UserEncryptionSignedPrekey> findActiveByDeviceIdAndKeyId(
            @Param("deviceId") UUID deviceId,
            @Param("keyId") int keyId,
            @Param("now") Instant now
    );

    @Query("""
            select prekey
            from UserEncryptionSignedPrekey prekey
            where prekey.deviceId in :deviceIds
              and (prekey.retiredAt is null or prekey.expiresAt > :now)
            """)
    List<UserEncryptionSignedPrekey> findAllActiveByDeviceIdIn(
            @Param("deviceIds") Collection<UUID> deviceIds,
            @Param("now") Instant now
    );

    @Modifying
    @Query("""
            delete from UserEncryptionSignedPrekey prekey
            where prekey.deviceId = :deviceId
              and prekey.retiredAt is not null
              and prekey.expiresAt is not null
              and prekey.expiresAt <= :now
            """)
    int deleteExpiredByDeviceId(@Param("deviceId") UUID deviceId, @Param("now") Instant now);
}
