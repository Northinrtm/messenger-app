package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "chat_message_keys")
public class ChatMessageKey {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "key_version", nullable = false, updatable = false)
    private int keyVersion;

    @Column(name = "encrypted_dek", nullable = false, updatable = false)
    @JdbcTypeCode(SqlTypes.VARBINARY)
    private byte[] encryptedDek;

    @Column(name = "key_provider", nullable = false, updatable = false, length = 32)
    private String keyProvider;

    @Column(name = "key_reference", nullable = false, updatable = false, length = 255)
    private String keyReference;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatMessageKey() {
    }

    public ChatMessageKey(
            UUID id,
            UUID chatId,
            int keyVersion,
            byte[] encryptedDek,
            String keyProvider,
            String keyReference,
            Instant createdAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.keyVersion = keyVersion;
        this.encryptedDek = encryptedDek;
        this.keyProvider = keyProvider;
        this.keyReference = keyReference;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public int getKeyVersion() {
        return keyVersion;
    }

    public byte[] getEncryptedDek() {
        return encryptedDek;
    }

    public String getKeyProvider() {
        return keyProvider;
    }

    public String getKeyReference() {
        return keyReference;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
