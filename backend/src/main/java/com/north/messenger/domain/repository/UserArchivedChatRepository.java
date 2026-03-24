package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserArchivedChat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserArchivedChatRepository extends JpaRepository<UserArchivedChat, UUID> {

    List<UserArchivedChat> findAllByUserIdOrderByArchivedAtDesc(UUID userId);

    Optional<UserArchivedChat> findByUserIdAndChatId(UUID userId, UUID chatId);
}
