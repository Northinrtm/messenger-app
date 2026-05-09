package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserMailbox;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserMailboxRepository extends JpaRepository<UserMailbox, UUID> {

    List<UserMailbox> findAllByUserIdOrderByCreatedAtDesc(UUID userId);

    boolean existsByUserIdAndEmail(UUID userId, String email);

    Optional<UserMailbox> findByIdAndUserId(UUID id, UUID userId);
}
