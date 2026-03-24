package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "message_receipts")
public class MessageReceipt {

    @Id
    private UUID id;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected MessageReceipt() {
    }

    public MessageReceipt(UUID id, UUID messageId, UUID userId, Instant deliveredAt, Instant readAt) {
        this.id = id;
        this.messageId = messageId;
        this.userId = userId;
        this.deliveredAt = deliveredAt;
        this.readAt = readAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public boolean markDelivered(Instant at) {
        if (deliveredAt != null) {
            return false;
        }

        deliveredAt = at;
        return true;
    }

    public boolean markRead(Instant at) {
        boolean changed = false;
        if (deliveredAt == null) {
            deliveredAt = at;
            changed = true;
        }
        if (readAt == null) {
            readAt = at;
            changed = true;
        }

        return changed;
    }
}
