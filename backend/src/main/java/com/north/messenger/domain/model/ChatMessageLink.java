package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_message_links")
public class ChatMessageLink {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "url", nullable = false, length = 2048)
    private String url;

    @Column(name = "position_index", nullable = false, updatable = false)
    private int positionIndex;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatMessageLink() {
    }

    public ChatMessageLink(
            UUID id,
            UUID chatId,
            UUID messageId,
            String url,
            int positionIndex,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.messageId = messageId;
        this.url = url;
        this.positionIndex = positionIndex;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public String getUrl() {
        return url;
    }

    public int getPositionIndex() {
        return positionIndex;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
