package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_pinned_messages")
public class ChatPinnedMessage {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "pinned_at", nullable = false)
    private Instant pinnedAt;

    protected ChatPinnedMessage() {
    }

    public ChatPinnedMessage(UUID id, UUID chatId, UUID messageId, Instant pinnedAt) {
        this.id = id;
        this.chatId = chatId;
        this.messageId = messageId;
        this.pinnedAt = pinnedAt;
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

    public Instant getPinnedAt() {
        return pinnedAt;
    }
}
