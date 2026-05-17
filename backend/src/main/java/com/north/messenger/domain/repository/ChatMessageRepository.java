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
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt >= :visibleFrom
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndCreatedAtAfterOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndCreatedAtBeforeOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt >= :visibleFrom
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndCreatedAtBetweenOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.serverOrder < :beforeServerOrder
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeServerOrder") long beforeServerOrder,
            @Param("userId") UUID userId,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.serverOrder < :beforeServerOrder
              and message.createdAt >= :visibleFrom
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndServerOrderBeforeAndCreatedAtAfterOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeServerOrder") long beforeServerOrder,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.serverOrder < :beforeServerOrder
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndServerOrderBeforeAndCreatedAtBeforeOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeServerOrder") long beforeServerOrder,
            @Param("userId") UUID userId,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.serverOrder < :beforeServerOrder
              and message.createdAt >= :visibleFrom
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findVisibleByChatIdAndServerOrderBeforeAndCreatedAtBetweenOrderByServerOrderDesc(
            @Param("chatId") UUID chatId,
            @Param("beforeServerOrder") long beforeServerOrder,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );

    Optional<ChatMessage> findByChatIdAndSenderIdAndClientMessageId(UUID chatId, UUID senderId, String clientMessageId);

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
            order by message.serverOrder desc
            """)
    List<ChatMessage> findLatestByChatId(
            @Param("chatId") UUID chatId,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
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

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt >= :visibleFrom
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findLatestVisibleByChatIdAndUserIdCreatedAfter(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findLatestVisibleByChatIdAndUserIdCreatedBefore(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt >= :visibleFrom
              and message.createdAt <= :visibleTo
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
            order by message.serverOrder desc
            """)
    List<ChatMessage> findLatestVisibleByChatIdAndUserIdCreatedBetween(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("visibleFrom") java.time.Instant visibleFrom,
            @Param("visibleTo") java.time.Instant visibleTo,
            Pageable pageable
    );
}
