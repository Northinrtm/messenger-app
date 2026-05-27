package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.MessageReceipt;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageReceiptRepository extends JpaRepository<MessageReceipt, UUID> {

    interface ChatUnreadCountView {
        UUID getChatId();

        long getUnreadCount();
    }

    interface UserUnreadCountView {
        UUID getUserId();

        long getUnreadCount();
    }

    List<MessageReceipt> findAllByMessageIdIn(Collection<UUID> messageIds);

    @Query("""
            select message.chatId as chatId, count(receipt.id) as unreadCount
            from MessageReceipt receipt, ChatMessage message
            where receipt.messageId = message.id
              and receipt.userId = :userId
              and receipt.readAt is null
              and message.chatId in :chatIds
              and not exists (
                select deleted.id
                from UserDeletedMessage deleted
                where deleted.userId = receipt.userId
                  and deleted.messageId = message.id
              )
            group by message.chatId
            """)
    List<ChatUnreadCountView> countUnreadByUserIdAndChatIdIn(
            @Param("userId") UUID userId,
            @Param("chatIds") Collection<UUID> chatIds
    );

    @Query("""
            select receipt.userId as userId, count(receipt.id) as unreadCount
            from MessageReceipt receipt, ChatMessage message
            where receipt.messageId = message.id
              and receipt.readAt is null
              and message.chatId = :chatId
              and not exists (
                select deleted.id
                from UserDeletedMessage deleted
                where deleted.userId = receipt.userId
                  and deleted.messageId = message.id
              )
            group by receipt.userId
            """)
    List<UserUnreadCountView> countUnreadByChatId(@Param("chatId") UUID chatId);

    @Query("""
            select receipt.userId as userId, count(receipt.id) as unreadCount
            from MessageReceipt receipt, ChatMessage message
            where receipt.messageId = message.id
              and receipt.userId in :userIds
              and receipt.readAt is null
              and not exists (
                select deleted.id
                from UserDeletedMessage deleted
                where deleted.userId = receipt.userId
                  and deleted.messageId = message.id
              )
            group by receipt.userId
            """)
    List<UserUnreadCountView> countTotalUnreadByUserIdIn(@Param("userIds") Collection<UUID> userIds);

    @Query("""
            select receipt
            from MessageReceipt receipt
            where receipt.userId = :userId
              and receipt.messageId in (
                select message.id
                from ChatMessage message
                where message.chatId = :chatId
                  and message.id in :messageIds
              )
            """)
    List<MessageReceipt> findAllByUserIdAndChatIdAndMessageIdIn(
            @Param("userId") UUID userId,
            @Param("chatId") UUID chatId,
            @Param("messageIds") Collection<UUID> messageIds
    );
}
