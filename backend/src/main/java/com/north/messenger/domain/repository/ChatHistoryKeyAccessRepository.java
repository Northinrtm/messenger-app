package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatHistoryKeyAccess;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatHistoryKeyAccessRepository extends JpaRepository<ChatHistoryKeyAccess, UUID> {

    Optional<ChatHistoryKeyAccess> findByHistoryKeyIdAndRecipientDeviceId(UUID historyKeyId, UUID recipientDeviceId);

    @Query("""
            select access
            from ChatHistoryKeyAccess access
            join ChatHistoryKey historyKey on historyKey.id = access.historyKeyId
            where historyKey.chatId = :chatId
              and access.recipientUserId = :recipientUserId
              and access.recipientDeviceId = :recipientDeviceId
            order by historyKey.createdAt asc, access.createdAt asc
            """)
    List<ChatHistoryKeyAccess> findAllByChatIdAndRecipientUserIdAndRecipientDeviceIdOrderByCreatedAtAsc(
            @Param("chatId") UUID chatId,
            @Param("recipientUserId") UUID recipientUserId,
            @Param("recipientDeviceId") UUID recipientDeviceId
    );

    @Query("""
            select count(distinct access.historyKeyId)
            from ChatHistoryKeyAccess access
            join ChatHistoryKey historyKey on historyKey.id = access.historyKeyId
            where historyKey.chatId = :chatId
              and access.recipientUserId = :recipientUserId
              and historyKey.createdAt < :joinedAt
            """)
    long countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
            @Param("chatId") UUID chatId,
            @Param("recipientUserId") UUID recipientUserId,
            @Param("joinedAt") java.time.Instant joinedAt
    );
}
