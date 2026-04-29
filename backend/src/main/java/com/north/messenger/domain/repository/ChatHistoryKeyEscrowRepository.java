package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatHistoryKeyEscrowRepository extends JpaRepository<ChatHistoryKeyEscrow, UUID> {

    Optional<ChatHistoryKeyEscrow> findByHistoryKeyId(UUID historyKeyId);

    @Query("""
            select escrow
            from ChatHistoryKeyEscrow escrow
            join ChatHistoryKey historyKey on historyKey.id = escrow.historyKeyId
            where escrow.chatId = :chatId
              and historyKey.createdAt < :beforeCreatedAt
            order by historyKey.createdAt asc, escrow.createdAt asc
            """)
    List<ChatHistoryKeyEscrow> findAllByChatIdAndHistoryKeyCreatedAtBeforeOrderByHistoryKeyCreatedAtAsc(
            @Param("chatId") UUID chatId,
            @Param("beforeCreatedAt") Instant beforeCreatedAt
    );

    @Query("""
            select distinct escrow.historyKeyId
            from ChatHistoryKeyEscrow escrow
            join ChatHistoryKey historyKey on historyKey.id = escrow.historyKeyId
            where escrow.chatId = :chatId
              and historyKey.createdAt < :beforeCreatedAt
            """)
    List<UUID> findDistinctHistoryKeyIdsByChatIdAndHistoryKeyCreatedAtBefore(
            @Param("chatId") UUID chatId,
            @Param("beforeCreatedAt") Instant beforeCreatedAt
    );
}
