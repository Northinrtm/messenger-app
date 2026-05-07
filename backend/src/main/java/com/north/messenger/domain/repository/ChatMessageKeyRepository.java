package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessageKey;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageKeyRepository extends JpaRepository<ChatMessageKey, UUID> {

    Optional<ChatMessageKey> findFirstByChatIdOrderByKeyVersionDesc(UUID chatId);

    Optional<ChatMessageKey> findByChatIdAndKeyVersion(UUID chatId, int keyVersion);
}
