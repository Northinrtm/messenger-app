package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_pending_outgoing_messages")
public class UserPendingOutgoingMessage {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "client_message_id", nullable = false, length = 120)
    private String clientMessageId;

    @Column(name = "content", nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "local_order")
    private Long localOrder;

    @Column(name = "recipient_count", nullable = false)
    private int recipientCount;

    @Column(name = "reply_to_payload_json", columnDefinition = "text")
    private String replyToPayloadJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 24)
    private PendingOutgoingMessageStatus status;

    @Column(name = "attachments_payload_json", nullable = false, columnDefinition = "text")
    private String attachmentsPayloadJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPendingOutgoingMessage() {
    }

    public UserPendingOutgoingMessage(
            UUID id,
            UUID userId,
            UUID chatId,
            String clientMessageId,
            String content,
            Instant createdAt,
            Long localOrder,
            int recipientCount,
            String replyToPayloadJson,
            PendingOutgoingMessageStatus status,
            String attachmentsPayloadJson,
            Instant updatedAt
    ) {
        this.id = id;
        this.userId = userId;
        this.chatId = chatId;
        this.clientMessageId = clientMessageId;
        this.content = content;
        this.createdAt = createdAt;
        this.localOrder = localOrder;
        this.recipientCount = recipientCount;
        this.replyToPayloadJson = replyToPayloadJson;
        this.status = status;
        this.attachmentsPayloadJson = attachmentsPayloadJson;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getChatId() {
        return chatId;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public String getContent() {
        return content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Long getLocalOrder() {
        return localOrder;
    }

    public int getRecipientCount() {
        return recipientCount;
    }

    public String getReplyToPayloadJson() {
        return replyToPayloadJson;
    }

    public PendingOutgoingMessageStatus getStatus() {
        return status;
    }

    public String getAttachmentsPayloadJson() {
        return attachmentsPayloadJson;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(
            UUID nextChatId,
            String nextContent,
            Instant nextCreatedAt,
            Long nextLocalOrder,
            int nextRecipientCount,
            String nextReplyToPayloadJson,
            PendingOutgoingMessageStatus nextStatus,
            String nextAttachmentsPayloadJson,
            Instant nextUpdatedAt
    ) {
        this.chatId = nextChatId;
        this.content = nextContent;
        this.createdAt = nextCreatedAt;
        this.localOrder = nextLocalOrder;
        this.recipientCount = nextRecipientCount;
        this.replyToPayloadJson = nextReplyToPayloadJson;
        this.status = nextStatus;
        this.attachmentsPayloadJson = nextAttachmentsPayloadJson;
        this.updatedAt = nextUpdatedAt;
    }
}
