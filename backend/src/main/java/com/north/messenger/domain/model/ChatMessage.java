package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "content_ciphertext", nullable = false)
    @JdbcTypeCode(SqlTypes.VARBINARY)
    private byte[] contentCiphertext;

    @Column(name = "content_iv", nullable = false)
    @JdbcTypeCode(SqlTypes.VARBINARY)
    private byte[] contentIv;

    @Column(name = "content_key_version", nullable = false)
    private int contentKeyVersion;

    @Column(name = "content_algorithm", nullable = false, length = 32)
    private String contentAlgorithm;

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

    @Transient
    private String content;

    protected ChatMessage() {
    }

    public ChatMessage(UUID id, UUID chatId, UUID senderId, String content, Instant createdAt) {
        this(id, chatId, senderId, content, null, null, createdAt);
    }

    public ChatMessage(
            UUID id,
            UUID chatId,
            UUID senderId,
            String content,
            String clientMessageId,
            UUID replyToMessageId,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.senderId = senderId;
        this.content = content;
        this.clientMessageId = clientMessageId;
        this.replyToMessageId = replyToMessageId;
        this.createdAt = createdAt;
    }

    public ChatMessage(
            UUID id,
            UUID chatId,
            UUID senderId,
            byte[] contentCiphertext,
            byte[] contentIv,
            int contentKeyVersion,
            String contentAlgorithm,
            String clientMessageId,
            UUID replyToMessageId,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.senderId = senderId;
        this.contentCiphertext = contentCiphertext;
        this.contentIv = contentIv;
        this.contentKeyVersion = contentKeyVersion;
        this.contentAlgorithm = contentAlgorithm;
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

    public byte[] getContentCiphertext() {
        return contentCiphertext;
    }

    public byte[] getContentIv() {
        return contentIv;
    }

    public int getContentKeyVersion() {
        return contentKeyVersion;
    }

    public String getContentAlgorithm() {
        return contentAlgorithm;
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

    public void cacheDecryptedContent(String content) {
        this.content = content;
    }

    public void updateEncryptedContent(
            byte[] contentCiphertext,
            byte[] contentIv,
            int contentKeyVersion,
            String contentAlgorithm,
            String decryptedContent,
            Instant editedAt
    ) {
        this.contentCiphertext = contentCiphertext;
        this.contentIv = contentIv;
        this.contentKeyVersion = contentKeyVersion;
        this.contentAlgorithm = contentAlgorithm;
        this.content = decryptedContent;
        this.editedAt = editedAt;
    }
}

