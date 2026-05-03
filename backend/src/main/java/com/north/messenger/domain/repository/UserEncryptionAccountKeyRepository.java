package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionAccountKey;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserEncryptionAccountKeyRepository extends JpaRepository<UserEncryptionAccountKey, UUID> {

    Optional<UserEncryptionAccountKey> findByUserId(UUID userId);

    List<UserEncryptionAccountKey> findAllByUserIdIn(List<UUID> userIds);

    @Query("""
            select accountKey.accountKeyVersion
            from UserEncryptionAccountKey accountKey
            where accountKey.userId = :userId
            """)
    Optional<Long> findAccountKeyVersionByUserId(@Param("userId") UUID userId);

    @Query("""
            select accountKey.identityGeneration
            from UserEncryptionAccountKey accountKey
            where accountKey.userId = :userId
            """)
    Optional<Long> findIdentityGenerationByUserId(@Param("userId") UUID userId);
}
