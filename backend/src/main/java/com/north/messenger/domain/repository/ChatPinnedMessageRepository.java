package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatPinnedMessage;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatPinnedMessageRepository extends JpaRepository<ChatPinnedMessage, UUID> {

    Optional<ChatPinnedMessage> findByChatIdAndMessageId(UUID chatId, UUID messageId);

    List<ChatPinnedMessage> findAllByChatIdOrderByPinnedAtDescIdDesc(UUID chatId);

    List<ChatPinnedMessage> findAllByChatIdInOrderByPinnedAtDescIdDesc(Collection<UUID> chatIds);

    void deleteByChatId(UUID chatId);

    void deleteByChatIdAndMessageId(UUID chatId, UUID messageId);

    void deleteByChatIdAndMessageIdIn(UUID chatId, Collection<UUID> messageIds);
}
