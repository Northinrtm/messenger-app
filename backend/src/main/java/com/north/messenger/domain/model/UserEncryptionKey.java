package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_keys")
public class UserEncryptionKey {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "public_key", nullable = false, columnDefinition = "text")
    private String publicKey;

    @Column(name = "encrypted_private_key", nullable = false, columnDefinition = "text")
    private String encryptedPrivateKey;

    @Column(name = "kdf_salt", nullable = false, length = 255)
    private String kdfSalt;

    @Column(name = "kdf_iv", nullable = false, length = 255)
    private String kdfIv;

    @Column(name = "kdf_iterations", nullable = false)
    private int kdfIterations;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEncryptionKey() {
    }

    public UserEncryptionKey(
            UUID userId,
            String publicKey,
            String encryptedPrivateKey,
            String kdfSalt,
            String kdfIv,
            int kdfIterations,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.userId = userId;
        this.publicKey = publicKey;
        this.encryptedPrivateKey = encryptedPrivateKey;
        this.kdfSalt = kdfSalt;
        this.kdfIv = kdfIv;
        this.kdfIterations = kdfIterations;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public String getEncryptedPrivateKey() {
        return encryptedPrivateKey;
    }

    public String getKdfSalt() {
        return kdfSalt;
    }

    public String getKdfIv() {
        return kdfIv;
    }

    public int getKdfIterations() {
        return kdfIterations;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(
            String publicKey,
            String encryptedPrivateKey,
            String kdfSalt,
            String kdfIv,
            int kdfIterations,
            Instant updatedAt
    ) {
        this.publicKey = publicKey;
        this.encryptedPrivateKey = encryptedPrivateKey;
        this.kdfSalt = kdfSalt;
        this.kdfIv = kdfIv;
        this.kdfIterations = kdfIterations;
        this.updatedAt = updatedAt;
    }
}
