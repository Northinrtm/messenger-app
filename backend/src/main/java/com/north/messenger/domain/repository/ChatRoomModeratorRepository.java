package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatRoomModerator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomModeratorRepository extends JpaRepository<ChatRoomModerator, UUID> {

    List<ChatRoomModerator> findAllByChatId(UUID chatId);

    Optional<ChatRoomModerator> findByChatIdAndUserId(UUID chatId, UUID userId);

    boolean existsByChatIdAndUserId(UUID chatId, UUID userId);

    void deleteByChatIdAndUserId(UUID chatId, UUID userId);
}
