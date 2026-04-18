package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_envelope_counters")
public class UserEncryptionEnvelopeCounter {

    @Id
    private UUID id;

    @Column(name = "sender_device_id", nullable = false)
    private UUID senderDeviceId;

    @Column(name = "recipient_device_id", nullable = false)
    private UUID recipientDeviceId;

    @Column(name = "ratchet_public_key", nullable = false, columnDefinition = "text")
    private String ratchetPublicKey;

    @Column(name = "initiator_ephemeral_public_key", columnDefinition = "text")
    private String initiatorEphemeralPublicKey;

    @Column(name = "last_message_counter", nullable = false)
    private int lastMessageCounter;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEncryptionEnvelopeCounter() {
    }

    public UserEncryptionEnvelopeCounter(
            UUID id,
            UUID senderDeviceId,
            UUID recipientDeviceId,
            String ratchetPublicKey,
            String initiatorEphemeralPublicKey,
            int lastMessageCounter,
            Instant updatedAt
    ) {
        this.id = id;
        this.senderDeviceId = senderDeviceId;
        this.recipientDeviceId = recipientDeviceId;
        this.ratchetPublicKey = ratchetPublicKey;
        this.initiatorEphemeralPublicKey = initiatorEphemeralPublicKey;
        this.lastMessageCounter = lastMessageCounter;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getSenderDeviceId() {
        return senderDeviceId;
    }

    public UUID getRecipientDeviceId() {
        return recipientDeviceId;
    }

    public String getRatchetPublicKey() {
        return ratchetPublicKey;
    }

    public String getInitiatorEphemeralPublicKey() {
        return initiatorEphemeralPublicKey;
    }

    public int getLastMessageCounter() {
        return lastMessageCounter;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void bindInitiatorEphemeralPublicKeyIfMissing(String initiatorEphemeralPublicKey) {
        if (this.initiatorEphemeralPublicKey == null || this.initiatorEphemeralPublicKey.isBlank()) {
            this.initiatorEphemeralPublicKey = initiatorEphemeralPublicKey;
        }
    }

    public void advanceTo(int messageCounter, Instant updatedAt) {
        this.lastMessageCounter = messageCounter;
        this.updatedAt = updatedAt;
    }
}
