package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_attachments")
public class ChatAttachment {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "message_id")
    private UUID messageId;

    @Column(name = "uploader_id", nullable = false, updatable = false)
    private UUID uploaderId;

    @Column(name = "storage_key", nullable = false, updatable = false, length = 255)
    private String storageKey;

    @Column(name = "ciphertext_size_bytes", nullable = false, updatable = false)
    private long ciphertextSizeBytes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatAttachment() {
    }

    public ChatAttachment(
            UUID id,
            UUID chatId,
            UUID uploaderId,
            String storageKey,
            long ciphertextSizeBytes,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.uploaderId = uploaderId;
        this.storageKey = storageKey;
        this.ciphertextSizeBytes = ciphertextSizeBytes;
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

    public UUID getUploaderId() {
        return uploaderId;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public long getCiphertextSizeBytes() {
        return ciphertextSizeBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void attachToMessage(UUID messageId) {
        this.messageId = messageId;
    }
}
