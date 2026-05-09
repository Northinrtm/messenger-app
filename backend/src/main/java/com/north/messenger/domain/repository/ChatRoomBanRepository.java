package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatRoomBan;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomBanRepository extends JpaRepository<ChatRoomBan, UUID> {

    boolean existsByChatIdAndUserId(UUID chatId, UUID userId);

    Optional<ChatRoomBan> findByChatIdAndUserId(UUID chatId, UUID userId);

    List<ChatRoomBan> findAllByChatId(UUID chatId);

    void deleteByChatIdAndUserId(UUID chatId, UUID userId);
}
