package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatAttachment;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatAttachmentRepository extends JpaRepository<ChatAttachment, UUID> {

    interface AttachmentBrowserItemView {
        UUID getAttachmentId();

        Instant getAttachmentCreatedAt();

        UUID getMessageId();

        Instant getMessageCreatedAt();

        Long getMessageServerOrder();

        UUID getSenderId();

        String getFileName();

        String getMimeType();

        long getSizeBytes();
    }

    Optional<ChatAttachment> findByIdAndChatId(UUID id, UUID chatId);

    List<ChatAttachment> findAllByMessageId(UUID messageId);

    List<ChatAttachment> findAllByMessageIdInOrderByCreatedAtAsc(Collection<UUID> messageIds);

    List<ChatAttachment> findAllByMessageIdIsNullAndCreatedAtBefore(Instant createdAt);

    boolean existsByMessageId(UUID messageId);

    @Query("""
            select
                attachment.id as attachmentId,
                attachment.createdAt as attachmentCreatedAt,
                message.id as messageId,
                message.createdAt as messageCreatedAt,
                message.serverOrder as messageServerOrder,
                message.senderId as senderId,
                attachment.fileName as fileName,
                attachment.mimeType as mimeType,
                attachment.sizeBytes as sizeBytes
            from ChatAttachment attachment, ChatMessage message
            where attachment.chatId = :chatId
              and attachment.messageId = message.id
              and (:applyVisibleFrom = false or message.createdAt >= :visibleFrom)
              and (:applyVisibleTo = false or message.createdAt <= :visibleTo)
              and (:imagesOnly = false or lower(attachment.mimeType) like 'image/%')
              and (:documentsOnly = false or lower(attachment.mimeType) not like 'image/%')
              and not exists (
                select 1 from UserDeletedMessage deleted
                where deleted.userId = :userId and deleted.messageId = message.id
              )
              and (
                :applyCursor = false
                or message.serverOrder < :cursorServerOrder
                or (message.serverOrder = :cursorServerOrder and attachment.createdAt < :cursorAttachmentCreatedAt)
                or (
                    message.serverOrder = :cursorServerOrder
                    and attachment.createdAt = :cursorAttachmentCreatedAt
                    and attachment.id < :cursorAttachmentId
                )
              )
            order by message.serverOrder desc, attachment.createdAt desc, attachment.id desc
            """)
    List<AttachmentBrowserItemView> findBrowserItems(
            @Param("chatId") UUID chatId,
            @Param("userId") UUID userId,
            @Param("applyVisibleFrom") boolean applyVisibleFrom,
            @Param("visibleFrom") Instant visibleFrom,
            @Param("applyVisibleTo") boolean applyVisibleTo,
            @Param("visibleTo") Instant visibleTo,
            @Param("imagesOnly") boolean imagesOnly,
            @Param("documentsOnly") boolean documentsOnly,
            @Param("applyCursor") boolean applyCursor,
            @Param("cursorServerOrder") Long cursorServerOrder,
            @Param("cursorAttachmentCreatedAt") Instant cursorAttachmentCreatedAt,
            @Param("cursorAttachmentId") UUID cursorAttachmentId,
            Pageable pageable
    );
}
