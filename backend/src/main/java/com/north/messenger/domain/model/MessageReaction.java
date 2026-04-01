package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "message_reactions")
public class MessageReaction {

    @Id
    private UUID id;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "reaction_key", nullable = false, length = 24)
    private String reactionKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected MessageReaction() {
    }

    public MessageReaction(UUID id, UUID messageId, UUID userId, String reactionKey, Instant createdAt) {
        this.id = id;
        this.messageId = messageId;
        this.userId = userId;
        this.reactionKey = reactionKey;
        this.createdAt = createdAt;
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

    public String getReactionKey() {
        return reactionKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
