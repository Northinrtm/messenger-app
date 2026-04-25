package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_message_recipient_payloads")
@IdClass(ChatMessageRecipientPayloadId.class)
public class ChatMessageRecipientPayload {

    @Id
    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Id
    @Column(name = "recipient_device_id", nullable = false, updatable = false)
    private UUID recipientDeviceId;

    @Column(name = "recipient_user_id", nullable = false, updatable = false)
    private UUID recipientUserId;

    @Column(name = "encrypted_payload", nullable = false, updatable = false, columnDefinition = "text")
    private String encryptedPayload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatMessageRecipientPayload() {
    }

    public ChatMessageRecipientPayload(
            UUID messageId,
            UUID recipientDeviceId,
            UUID recipientUserId,
            String encryptedPayload,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.recipientDeviceId = recipientDeviceId;
        this.recipientUserId = recipientUserId;
        this.encryptedPayload = encryptedPayload;
        this.createdAt = createdAt;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public UUID getRecipientDeviceId() {
        return recipientDeviceId;
    }

    public UUID getRecipientUserId() {
        return recipientUserId;
    }

    public String getEncryptedPayload() {
        return encryptedPayload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
