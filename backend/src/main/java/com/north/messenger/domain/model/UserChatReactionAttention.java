package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_chat_reaction_attentions")
public class UserChatReactionAttention {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserChatReactionAttention() {
    }

    public UserChatReactionAttention(UUID id, UUID userId, UUID chatId, Instant updatedAt) {
        this.id = id;
        this.userId = userId;
        this.chatId = chatId;
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

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
