package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessage;
import java.time.Instant;
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
            order by message.createdAt desc, message.id desc
            """)
    List<ChatMessage> findVisibleEncryptedByChatIdOrderByCreatedAtDesc(
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
              and message.createdAt < :before
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.createdAt desc, message.id desc
            """)
    List<ChatMessage> findVisibleEncryptedByChatIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            @Param("chatId") UUID chatId,
            @Param("before") Instant before,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    @Query(value = """
            select message.*
            from chat_messages message
            where message.chat_id = :chatId
              and message.encryption_scheme is not null
              and message.encryption_scheme <> ''
              and (
                message.created_at < :beforeCreatedAt
                or (message.created_at = :beforeCreatedAt and message.id < :beforeMessageId)
              )
              and not exists (
                select 1 from user_deleted_messages deleted
                where deleted.user_id = :userId and deleted.message_id = message.id
              )
            order by message.created_at desc, message.id desc
            """, nativeQuery = true)
    List<ChatMessage> findVisibleEncryptedByChatIdAndCreatedAtBeforeOrAtAndIdBeforeOrderByCreatedAtDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeCreatedAt") Instant beforeCreatedAt,
            @Param("beforeMessageId") UUID beforeMessageId,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    Optional<ChatMessage> findByChatIdAndSenderIdAndClientMessageId(UUID chatId, UUID senderId, String clientMessageId);

    Optional<ChatMessage> findTopByChatIdAndEncryptionSchemeIsNotNullOrderByCreatedAtDesc(UUID chatId);

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
            order by message.createdAt desc, message.id desc
            """)
    List<ChatMessage> findLatestVisibleByChatIdAndUserId(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            Pageable pageable
    );
}
