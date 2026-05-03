package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserChatDraft;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserChatDraftRepository extends JpaRepository<UserChatDraft, UUID> {

    @Query("""
            select draft
            from UserChatDraft draft
            where draft.userId = :userId
              and exists (
                select 1
                from ChatParticipant membership
                where membership.chatId = draft.chatId
                  and membership.userId = :userId
              )
              and not exists (
                select 1
                from UserDeletedChat deletedChat
                where deletedChat.chatId = draft.chatId
                  and deletedChat.userId = :userId
              )
            order by draft.updatedAt desc
            """)
    List<UserChatDraft> findVisibleByUserIdOrderByUpdatedAtDesc(@Param("userId") UUID userId);

    Optional<UserChatDraft> findByUserIdAndChatId(UUID userId, UUID chatId);

    void deleteByUserIdAndChatId(UUID userId, UUID chatId);

    @Modifying
    void deleteAllByChatIdAndUserIdIn(UUID chatId, Iterable<UUID> userIds);
}
