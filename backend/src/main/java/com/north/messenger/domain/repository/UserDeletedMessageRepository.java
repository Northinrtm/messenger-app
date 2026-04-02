package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserDeletedMessage;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserDeletedMessageRepository extends JpaRepository<UserDeletedMessage, UUID> {

    Optional<UserDeletedMessage> findByUserIdAndMessageId(UUID userId, UUID messageId);

    boolean existsByUserIdAndMessageId(UUID userId, UUID messageId);

    List<UserDeletedMessage> findAllByUserIdAndMessageIdIn(UUID userId, Collection<UUID> messageIds);
}
