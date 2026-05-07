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

    @Column(name = "file_name", nullable = false, updatable = false, length = 255)
    private String fileName;

    @Column(name = "mime_type", nullable = false, updatable = false, length = 255)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatAttachment() {
    }

    public ChatAttachment(
            UUID id,
            UUID chatId,
            UUID uploaderId,
            String storageKey,
            String fileName,
            String mimeType,
            long sizeBytes,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.uploaderId = uploaderId;
        this.storageKey = storageKey;
        this.fileName = fileName;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
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

    public String getFileName() {
        return fileName;
    }

    public String getMimeType() {
        return mimeType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void attachToMessage(UUID messageId) {
        this.messageId = messageId;
    }
}
