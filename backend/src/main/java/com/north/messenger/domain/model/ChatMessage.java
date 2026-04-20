package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "content", nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "encryption_scheme", length = 120)
    private String encryptionScheme;

    @Column(name = "encryption_iv", length = 255)
    private String encryptionIv;

    @Column(name = "encrypted_keys_json", columnDefinition = "text")
    private String encryptedKeysJson;

    @Column(name = "client_message_id", length = 120, updatable = false)
    private String clientMessageId;

    @Column(name = "server_order", nullable = false, updatable = false, insertable = false)
    private Long serverOrder;

    @Column(name = "reply_to_message_id")
    private UUID replyToMessageId;

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatMessage() {
    }

    public ChatMessage(UUID id, UUID chatId, UUID senderId, String content, Instant createdAt) {
        this(id, chatId, senderId, content, null, null, null, null, null, createdAt);
    }

    public ChatMessage(
            UUID id,
            UUID chatId,
            UUID senderId,
            String content,
            String encryptionScheme,
            String encryptionIv,
            String encryptedKeysJson,
            Instant createdAt
    ) {
        this(id, chatId, senderId, content, encryptionScheme, encryptionIv, encryptedKeysJson, null, null, createdAt);
    }

    public ChatMessage(
            UUID id,
            UUID chatId,
            UUID senderId,
            String content,
            String encryptionScheme,
            String encryptionIv,
            String encryptedKeysJson,
            String clientMessageId,
            UUID replyToMessageId,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.senderId = senderId;
        this.content = content;
        this.encryptionScheme = encryptionScheme;
        this.encryptionIv = encryptionIv;
        this.encryptedKeysJson = encryptedKeysJson;
        this.clientMessageId = clientMessageId;
        this.replyToMessageId = replyToMessageId;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public String getContent() {
        return content;
    }

    public String getEncryptionScheme() {
        return encryptionScheme;
    }

    public String getEncryptionIv() {
        return encryptionIv;
    }

    public String getEncryptedKeysJson() {
        return encryptedKeysJson;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public Long getServerOrder() {
        return serverOrder;
    }

    public UUID getReplyToMessageId() {
        return replyToMessageId;
    }

    public Instant getEditedAt() {
        return editedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isEncrypted() {
        return encryptionScheme != null && !encryptionScheme.isBlank()
                && encryptionIv != null && !encryptionIv.isBlank()
                && encryptedKeysJson != null && !encryptedKeysJson.isBlank()
                && content != null && !content.isBlank();
    }

    public void encrypt(
            String ciphertext,
            String encryptionScheme,
            String encryptionIv,
            String encryptedKeysJson
    ) {
        this.content = ciphertext;
        this.encryptionScheme = encryptionScheme;
        this.encryptionIv = encryptionIv;
        this.encryptedKeysJson = encryptedKeysJson;
    }

    public void updateEncryptedContent(
            String ciphertext,
            String encryptionScheme,
            String encryptionIv,
            String encryptedKeysJson,
            Instant editedAt
    ) {
        encrypt(ciphertext, encryptionScheme, encryptionIv, encryptedKeysJson);
        this.editedAt = editedAt;
    }
}

