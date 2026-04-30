package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatHistoryKeyUserAccess;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatHistoryKeyUserAccessRepository extends JpaRepository<ChatHistoryKeyUserAccess, UUID> {

    List<ChatHistoryKeyUserAccess> findAllByHistoryKeyId(UUID historyKeyId);

    @Query("""
            select access
            from ChatHistoryKeyUserAccess access
            join ChatHistoryKey historyKey on historyKey.id = access.historyKeyId
            where historyKey.chatId = :chatId
              and access.recipientUserId = :recipientUserId
            order by access.createdAt asc
            """)
    List<ChatHistoryKeyUserAccess> findAllByChatIdAndRecipientUserIdOrderByCreatedAtAsc(
            @Param("chatId") UUID chatId,
            @Param("recipientUserId") UUID recipientUserId
    );

    @Query("""
            select distinct access.historyKeyId
            from ChatHistoryKeyUserAccess access
            join ChatHistoryKey historyKey on historyKey.id = access.historyKeyId
            where historyKey.chatId = :chatId
              and access.recipientUserId = :recipientUserId
              and historyKey.createdAt < :joinedAt
            """)
    List<UUID> findDistinctHistoryKeyIdsByChatIdAndRecipientUserIdBeforeJoinedAt(
            @Param("chatId") UUID chatId,
            @Param("recipientUserId") UUID recipientUserId,
            @Param("joinedAt") java.time.Instant joinedAt
    );

    Optional<ChatHistoryKeyUserAccess> findByHistoryKeyIdAndRecipientUserId(UUID historyKeyId, UUID recipientUserId);
}
