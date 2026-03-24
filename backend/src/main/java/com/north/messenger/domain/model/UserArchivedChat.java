package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_archived_chats")
public class UserArchivedChat {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "archived_at", nullable = false, updatable = false)
    private Instant archivedAt;

    protected UserArchivedChat() {
    }

    public UserArchivedChat(UUID id, UUID userId, UUID chatId, Instant archivedAt) {
        this.id = id;
        this.userId = userId;
        this.chatId = chatId;
        this.archivedAt = archivedAt;
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

    public Instant getArchivedAt() {
        return archivedAt;
    }
}
