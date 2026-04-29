package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_history_key_escrow")
public class ChatHistoryKeyEscrow {

    @Id
    private UUID id;

    @Column(name = "history_key_id", nullable = false)
    private UUID historyKeyId;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "encrypted_grant_payload_json", nullable = false, columnDefinition = "text")
    private String encryptedGrantPayloadJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ChatHistoryKeyEscrow() {
    }

    public ChatHistoryKeyEscrow(
            UUID id,
            UUID historyKeyId,
            UUID chatId,
            String encryptedGrantPayloadJson,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = id;
        this.historyKeyId = historyKeyId;
        this.chatId = chatId;
        this.encryptedGrantPayloadJson = encryptedGrantPayloadJson;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getHistoryKeyId() {
        return historyKeyId;
    }

    public UUID getChatId() {
        return chatId;
    }

    public String getEncryptedGrantPayloadJson() {
        return encryptedGrantPayloadJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void updateEncryptedGrantPayloadJson(String encryptedGrantPayloadJson, Instant updatedAt) {
        this.encryptedGrantPayloadJson = encryptedGrantPayloadJson;
        this.updatedAt = updatedAt;
    }
}
