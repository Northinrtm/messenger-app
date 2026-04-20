package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessage;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.encryptionScheme is not null
              and message.encryptionScheme <> ''
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleEncryptedByChatIdOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.encryptionScheme is not null
              and message.encryptionScheme <> ''
              and message.serverOrder < :beforeServerOrder
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleEncryptedByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeServerOrder") long beforeServerOrder,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    Optional<ChatMessage> findByChatIdAndSenderIdAndClientMessageId(UUID chatId, UUID senderId, String clientMessageId);

    Optional<ChatMessage> findTopByChatIdAndEncryptionSchemeIsNotNullOrderByServerOrderDesc(UUID chatId);

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.encryptionScheme is not null
              and message.encryptionScheme <> ''
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findLatestVisibleByChatIdAndUserId(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            Pageable pageable
    );
}
