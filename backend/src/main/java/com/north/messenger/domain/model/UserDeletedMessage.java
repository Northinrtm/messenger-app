package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_deleted_messages")
public class UserDeletedMessage {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "deleted_at", nullable = false, updatable = false)
    private Instant deletedAt;

    protected UserDeletedMessage() {
    }

    public UserDeletedMessage(UUID id, UUID userId, UUID messageId, Instant deletedAt) {
        this.id = id;
        this.userId = userId;
        this.messageId = messageId;
        this.deletedAt = deletedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
