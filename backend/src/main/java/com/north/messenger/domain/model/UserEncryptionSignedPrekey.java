package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_signed_prekeys")
public class UserEncryptionSignedPrekey {

    @Id
    private UUID id;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    @Column(name = "key_id", nullable = false)
    private int keyId;

    @Column(name = "public_key", nullable = false, columnDefinition = "text")
    private String publicKey;

    @Column(name = "signature", nullable = false, columnDefinition = "text")
    private String signature;

    @Column(name = "algorithm", nullable = false)
    private String algorithm;

    @Column(name = "activated_at", nullable = false)
    private Instant activatedAt;

    @Column(name = "retired_at")
    private Instant retiredAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    protected UserEncryptionSignedPrekey() {
    }

    public UserEncryptionSignedPrekey(
            UUID id,
            UUID deviceId,
            int keyId,
            String publicKey,
            String signature,
            String algorithm,
            Instant activatedAt,
            Instant retiredAt,
            Instant expiresAt
    ) {
        this.id = id;
        this.deviceId = deviceId;
        this.keyId = keyId;
        this.publicKey = publicKey;
        this.signature = signature;
        this.algorithm = algorithm;
        this.activatedAt = activatedAt;
        this.retiredAt = retiredAt;
        this.expiresAt = expiresAt;
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

    public String getSignature() {
        return signature;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getRetiredAt() {
        return retiredAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean matches(String publicKey, String signature, String algorithm) {
        return this.publicKey.equals(publicKey)
                && this.signature.equals(signature)
                && this.algorithm.equals(algorithm);
    }

    public void retire(Instant retiredAt, Instant expiresAt) {
        this.retiredAt = retiredAt;
        this.expiresAt = expiresAt;
    }
}
