package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatHistoryKey;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatHistoryKeyRepository extends JpaRepository<ChatHistoryKey, UUID> {

    Optional<ChatHistoryKey> findByIdAndChatId(UUID id, UUID chatId);
}
