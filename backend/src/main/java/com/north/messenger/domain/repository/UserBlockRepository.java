package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserBlock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserBlockRepository extends JpaRepository<UserBlock, UUID> {

    List<UserBlock> findAllByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<UserBlock> findByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);

    boolean existsByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);

    void deleteByUserIdAndBlockedUserId(UUID userId, UUID blockedUserId);
}
