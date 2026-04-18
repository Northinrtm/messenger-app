package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_one_time_prekeys")
public class UserEncryptionOneTimePrekey {

    @Id
    private UUID id;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    @Column(name = "key_id", nullable = false)
    private int keyId;

    @Column(name = "public_key", nullable = false, columnDefinition = "text")
    private String publicKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @Column(name = "claimed_by_sender_device_id")
    private UUID claimedBySenderDeviceId;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "accepted_initiator_ephemeral_public_key", columnDefinition = "text")
    private String acceptedInitiatorEphemeralPublicKey;

    @Column(name = "accepted_ratchet_public_key", columnDefinition = "text")
    private String acceptedRatchetPublicKey;

    protected UserEncryptionOneTimePrekey() {
    }

    public UserEncryptionOneTimePrekey(
            UUID id,
            UUID deviceId,
            int keyId,
            String publicKey,
            Instant createdAt,
            Instant claimedAt,
            UUID claimedBySenderDeviceId,
            Instant acceptedAt,
            String acceptedInitiatorEphemeralPublicKey,
            String acceptedRatchetPublicKey
    ) {
        this.id = id;
        this.deviceId = deviceId;
        this.keyId = keyId;
        this.publicKey = publicKey;
        this.createdAt = createdAt;
        this.claimedAt = claimedAt;
        this.claimedBySenderDeviceId = claimedBySenderDeviceId;
        this.acceptedAt = acceptedAt;
        this.acceptedInitiatorEphemeralPublicKey = acceptedInitiatorEphemeralPublicKey;
        this.acceptedRatchetPublicKey = acceptedRatchetPublicKey;
    }

    public UUID getId() {
        return id;
    }

    public UUID getDeviceId() {
        return deviceId;
    }

    public int getKeyId() {
        return keyId;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getClaimedAt() {
        return claimedAt;
    }

    public UUID getClaimedBySenderDeviceId() {
        return claimedBySenderDeviceId;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public String getAcceptedInitiatorEphemeralPublicKey() {
        return acceptedInitiatorEphemeralPublicKey;
    }

    public String getAcceptedRatchetPublicKey() {
        return acceptedRatchetPublicKey;
    }

    public void claim(Instant claimedAt, UUID claimedBySenderDeviceId) {
        this.claimedAt = claimedAt;
        this.claimedBySenderDeviceId = claimedBySenderDeviceId;
    }

    public void acceptBootstrap(
            Instant acceptedAt,
            String acceptedInitiatorEphemeralPublicKey,
            String acceptedRatchetPublicKey
    ) {
        this.acceptedAt = acceptedAt;
        this.acceptedInitiatorEphemeralPublicKey = acceptedInitiatorEphemeralPublicKey;
        this.acceptedRatchetPublicKey = acceptedRatchetPublicKey;
    }
}
