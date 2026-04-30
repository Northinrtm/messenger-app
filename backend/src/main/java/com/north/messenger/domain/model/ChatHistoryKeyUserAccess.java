package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_history_key_user_access")
public class ChatHistoryKeyUserAccess {

    @Id
    private UUID id;

    @Column(name = "history_key_id", nullable = false, updatable = false)
    private UUID historyKeyId;

    @Column(name = "recipient_user_id", nullable = false, updatable = false)
    private UUID recipientUserId;

    @Column(name = "wrapped_key_payload_json", nullable = false, columnDefinition = "text")
    private String wrappedKeyPayloadJson;

    @Column(name = "granted_by_user_id", nullable = false)
    private UUID grantedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ChatHistoryKeyUserAccess() {
    }

    public ChatHistoryKeyUserAccess(
            UUID id,
            UUID historyKeyId,
            UUID recipientUserId,
            String wrappedKeyPayloadJson,
            UUID grantedByUserId,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = id;
        this.historyKeyId = historyKeyId;
        this.recipientUserId = recipientUserId;
        this.wrappedKeyPayloadJson = wrappedKeyPayloadJson;
        this.grantedByUserId = grantedByUserId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getHistoryKeyId() {
        return historyKeyId;
    }

    public UUID getRecipientUserId() {
        return recipientUserId;
    }

    public String getWrappedKeyPayloadJson() {
        return wrappedKeyPayloadJson;
    }

    public UUID getGrantedByUserId() {
        return grantedByUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(String wrappedKeyPayloadJson, UUID grantedByUserId, Instant updatedAt) {
        this.wrappedKeyPayloadJson = wrappedKeyPayloadJson;
        this.grantedByUserId = grantedByUserId;
        this.updatedAt = updatedAt;
    }
}
