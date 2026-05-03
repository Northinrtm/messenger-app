package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserPendingOutgoingMessage;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserPendingOutgoingMessageRepository extends JpaRepository<UserPendingOutgoingMessage, UUID> {

    @Query("""
            select pending
            from UserPendingOutgoingMessage pending
            where pending.userId = :userId
              and exists (
                select 1
                from ChatParticipant membership
                where membership.chatId = pending.chatId
                  and membership.userId = :userId
              )
              and not exists (
                select 1
                from UserDeletedChat deletedChat
                where deletedChat.chatId = pending.chatId
                  and deletedChat.userId = :userId
              )
            order by pending.createdAt asc, pending.localOrder asc nulls last, pending.clientMessageId asc
            """)
    List<UserPendingOutgoingMessage> findVisibleByUserIdOrderByCreatedAtAsc(@Param("userId") UUID userId);

    Optional<UserPendingOutgoingMessage> findByUserIdAndClientMessageId(UUID userId, String clientMessageId);

    void deleteByUserIdAndClientMessageId(UUID userId, String clientMessageId);
}
