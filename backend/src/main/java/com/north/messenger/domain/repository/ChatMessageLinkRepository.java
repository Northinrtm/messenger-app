package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessageLink;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatMessageLinkRepository extends JpaRepository<ChatMessageLink, UUID> {

    interface LinkBrowserItemView {
        UUID getLinkId();

        UUID getMessageId();

        Instant getMessageCreatedAt();

        Long getMessageServerOrder();

        UUID getSenderId();

        String getUrl();

        int getPositionIndex();
    }

    void deleteAllByMessageId(UUID messageId);

    @Query("""
            select
                link.id as linkId,
                message.id as messageId,
                message.createdAt as messageCreatedAt,
                message.serverOrder as messageServerOrder,
                message.senderId as senderId,
                link.url as url,
                link.positionIndex as positionIndex
            from ChatMessageLink link, ChatMessage message
            where link.chatId = :chatId
              and link.messageId = message.id
              and (:applyVisibleFrom = false or message.createdAt >= :visibleFrom)
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
              and (
                :applyCursor = false
                or message.serverOrder < :cursorServerOrder
                or (
                    message.serverOrder = :cursorServerOrder
                    and link.positionIndex > :cursorPositionIndex
                )
              )
            order by message.serverOrder desc, link.positionIndex asc
            """)
    List<LinkBrowserItemView> findBrowserItems(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("applyVisibleFrom") boolean applyVisibleFrom,
            @Param("visibleFrom") Instant visibleFrom,
            @Param("applyCursor") boolean applyCursor,
            @Param("cursorServerOrder") Long cursorServerOrder,
            @Param("cursorPositionIndex") Integer cursorPositionIndex,
            Pageable pageable
    );
}
