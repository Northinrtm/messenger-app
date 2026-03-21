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

    List<ChatMessage> findByChatIdOrderByCreatedAtDesc(UUID chatId, Pageable pageable);

    @Query("""
            select message
            from ChatMessage message
            where message.chatId = :chatId
              and message.createdAt < :before
            order by message.createdAt desc
            """)
    List<ChatMessage> findByChatIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            @Param("chatId") UUID chatId,
            @Param("before") Instant before,
            Pageable pageable
    );

    Optional<ChatMessage> findTopByChatIdOrderByCreatedAtDesc(UUID chatId);
}