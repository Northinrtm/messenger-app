package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatParticipant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, UUID> {

    List<ChatParticipant> findAllByUserIdOrderByJoinedAtAsc(UUID userId);

    List<ChatParticipant> findAllByChatIdOrderByJoinedAtAsc(UUID chatId);

    Optional<ChatParticipant> findByChatIdAndUserId(UUID chatId, UUID userId);

    boolean existsByChatIdAndUserId(UUID chatId, UUID userId);

    @Query("""
            select (count(sharedMembership) > 0)
            from ChatParticipant sharedMembership
            where sharedMembership.userId = :firstUserId
              and exists (
                select 1
                from ChatParticipant otherMembership
                where otherMembership.chatId = sharedMembership.chatId
                  and otherMembership.userId = :secondUserId
              )
            """)
    boolean existsSharedChatBetweenUsers(
            @Param("firstUserId") UUID firstUserId,
            @Param("secondUserId") UUID secondUserId
    );

    @Query("""
            select distinct otherMembership.userId
            from ChatParticipant sharedMembership
            join ChatParticipant otherMembership
              on otherMembership.chatId = sharedMembership.chatId
            where sharedMembership.userId = :currentUserId
              and otherMembership.userId in :otherUserIds
            """)
    Set<UUID> findUserIdsSharingAnyChatWithUser(
            @Param("currentUserId") UUID currentUserId,
            @Param("otherUserIds") Collection<UUID> otherUserIds
    );

    void deleteByChatIdAndUserId(UUID chatId, UUID userId);
}

