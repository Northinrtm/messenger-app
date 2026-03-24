package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_chat_drafts")
public class UserChatDraft {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "content", nullable = false, length = 2000)
    private String content;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserChatDraft() {
    }

    public UserChatDraft(UUID id, UUID userId, UUID chatId, String content, Instant updatedAt) {
        this.id = id;
        this.userId = userId;
        this.chatId = chatId;
        this.content = content;
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

    public String getContent() {
        return content;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void updateContent(String nextContent, Instant at) {
        this.content = nextContent;
        this.updatedAt = at;
    }
}
