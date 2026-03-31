package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserDeletedChat;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserDeletedChatRepository extends JpaRepository<UserDeletedChat, UUID> {

    List<UserDeletedChat> findAllByChatId(UUID chatId);

    List<UserDeletedChat> findAllByUserIdOrderByDeletedAtDesc(UUID userId);

    Optional<UserDeletedChat> findByUserIdAndChatId(UUID userId, UUID chatId);

    void deleteByUserIdAndChatId(UUID userId, UUID chatId);

    void deleteByChatIdAndUserIdIn(UUID chatId, Collection<UUID> userIds);
}
