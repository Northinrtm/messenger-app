package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_devices")
public class UserEncryptionDevice {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_name", nullable = false)
    private String deviceName;

    @Column(name = "identity_key", nullable = false, columnDefinition = "text")
    private String identityKey;

    @Column(name = "identity_key_algorithm", nullable = false)
    private String identityKeyAlgorithm;

    @Column(name = "identity_signature_key", nullable = false, columnDefinition = "text")
    private String identitySignatureKey;

    @Column(name = "identity_signature_key_algorithm", nullable = false)
    private String identitySignatureKeyAlgorithm;

    @Column(name = "signed_prekey_id", nullable = false)
    private int signedPrekeyId;

    @Column(name = "signed_prekey_public_key", nullable = false, columnDefinition = "text")
    private String signedPrekeyPublicKey;

    @Column(name = "signed_prekey_signature", nullable = false, columnDefinition = "text")
    private String signedPrekeySignature;

    @Column(name = "signed_prekey_algorithm", nullable = false)
    private String signedPrekeyAlgorithm;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    @Column(name = "retired_at")
    private Instant retiredAt;

    protected UserEncryptionDevice() {
    }

    public UserEncryptionDevice(
            UUID id,
            UUID userId,
            String deviceName,
            String identityKey,
            String identityKeyAlgorithm,
            String identitySignatureKey,
            String identitySignatureKeyAlgorithm,
            int signedPrekeyId,
            String signedPrekeyPublicKey,
            String signedPrekeySignature,
            String signedPrekeyAlgorithm,
            Instant registeredAt,
            Instant lastSeenAt,
            Instant retiredAt
    ) {
        this.id = id;
        this.userId = userId;
        this.deviceName = deviceName;
        this.identityKey = identityKey;
        this.identityKeyAlgorithm = identityKeyAlgorithm;
        this.identitySignatureKey = identitySignatureKey;
        this.identitySignatureKeyAlgorithm = identitySignatureKeyAlgorithm;
        this.signedPrekeyId = signedPrekeyId;
        this.signedPrekeyPublicKey = signedPrekeyPublicKey;
        this.signedPrekeySignature = signedPrekeySignature;
        this.signedPrekeyAlgorithm = signedPrekeyAlgorithm;
        this.registeredAt = registeredAt;
        this.lastSeenAt = lastSeenAt;
        this.retiredAt = retiredAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public String getIdentityKey() {
        return identityKey;
    }

    public String getIdentityKeyAlgorithm() {
        return identityKeyAlgorithm;
    }

    public String getIdentitySignatureKey() {
        return identitySignatureKey;
    }

    public String getIdentitySignatureKeyAlgorithm() {
        return identitySignatureKeyAlgorithm;
    }

    public int getSignedPrekeyId() {
        return signedPrekeyId;
    }

    public String getSignedPrekeyPublicKey() {
        return signedPrekeyPublicKey;
    }

    public String getSignedPrekeySignature() {
        return signedPrekeySignature;
    }

    public String getSignedPrekeyAlgorithm() {
        return signedPrekeyAlgorithm;
    }

    public Instant getRegisteredAt() {
        return registeredAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public Instant getRetiredAt() {
        return retiredAt;
    }

    public void register(
            String deviceName,
            String identityKey,
            String identityKeyAlgorithm,
            String identitySignatureKey,
            String identitySignatureKeyAlgorithm,
            int signedPrekeyId,
            String signedPrekeyPublicKey,
            String signedPrekeySignature,
            String signedPrekeyAlgorithm,
            Instant lastSeenAt
    ) {
        this.deviceName = deviceName;
        this.identityKey = identityKey;
        this.identityKeyAlgorithm = identityKeyAlgorithm;
        this.identitySignatureKey = identitySignatureKey;
        this.identitySignatureKeyAlgorithm = identitySignatureKeyAlgorithm;
        this.signedPrekeyId = signedPrekeyId;
        this.signedPrekeyPublicKey = signedPrekeyPublicKey;
        this.signedPrekeySignature = signedPrekeySignature;
        this.signedPrekeyAlgorithm = signedPrekeyAlgorithm;
        this.lastSeenAt = lastSeenAt;
        this.retiredAt = null;
    }

    public void touch(Instant lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public void retire(Instant retiredAt) {
        this.retiredAt = retiredAt;
    }
}
