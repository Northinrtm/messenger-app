package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatHistoryBackfillStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatHistoryBackfillStatusRepository extends JpaRepository<ChatHistoryBackfillStatus, UUID> {

    Optional<ChatHistoryBackfillStatus> findByChatIdAndRecipientUserId(UUID chatId, UUID recipientUserId);

    List<ChatHistoryBackfillStatus> findAllByRecipientUserIdAndChatIdIn(UUID recipientUserId, Collection<UUID> chatIds);

    List<ChatHistoryBackfillStatus> findAllByChatIdAndRecipientUserIdIn(UUID chatId, Collection<UUID> recipientUserIds);

    void deleteByChatIdAndRecipientUserId(UUID chatId, UUID recipientUserId);
}
