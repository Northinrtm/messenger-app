package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserChatReactionAttention;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserChatReactionAttentionRepository extends JpaRepository<UserChatReactionAttention, UUID> {

    Optional<UserChatReactionAttention> findByUserIdAndChatId(UUID userId, UUID chatId);

    boolean existsByUserIdAndChatId(UUID userId, UUID chatId);

    void deleteByUserIdAndChatId(UUID userId, UUID chatId);
}
