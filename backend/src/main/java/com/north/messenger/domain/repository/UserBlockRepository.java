package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserBlock;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserBlockRepository extends JpaRepository<UserBlock, UUID> {

    List<UserBlock> findAllByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<UserBlock> findByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);

    boolean existsByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);

    @Query("""
            select block.blockedUserId
            from UserBlock block
            where block.userId = :userId
              and block.blockedUserId in :otherUserIds
            """)
    List<UUID> findBlockedUserIds(
            @Param("userId") UUID userId,
            @Param("otherUserIds") Collection<UUID> otherUserIds
    );

    @Query("""
            select block.userId
            from UserBlock block
            where block.blockedUserId = :userId
              and block.userId in :otherUserIds
            """)
    List<UUID> findBlockingUserIds(
            @Param("userId") UUID userId,
            @Param("otherUserIds") Collection<UUID> otherUserIds
    );

    void deleteByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);
}
