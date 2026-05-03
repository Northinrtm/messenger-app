package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_account_keys")
public class UserEncryptionAccountKey {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true, updatable = false)
    private UUID userId;

    @Column(name = "public_key", nullable = false, columnDefinition = "text")
    private String publicKey;

    @Column(name = "account_key_version", nullable = false)
    private long accountKeyVersion = 1L;

    @Column(name = "identity_generation", nullable = false)
    private long identityGeneration = 1L;

    @Column(name = "identity_signing_public_key", nullable = false, columnDefinition = "text")
    private String identitySigningPublicKey;

    @Column(name = "identity_key_algorithm", nullable = false, length = 48)
    private String identityKeyAlgorithm;

    @Column(name = "account_key_algorithm", nullable = false, length = 48)
    private String accountKeyAlgorithm;

    @Column(name = "signed_at", nullable = false)
    private Instant signedAt;

    @Column(name = "account_key_signature", nullable = false, columnDefinition = "text")
    private String accountKeySignature;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEncryptionAccountKey() {
    }

    public UserEncryptionAccountKey(
            UUID id,
            UUID userId,
            String publicKey,
            long identityGeneration,
            String identitySigningPublicKey,
            String identityKeyAlgorithm,
            String accountKeyAlgorithm,
            Instant signedAt,
            String accountKeySignature,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = id;
        this.userId = userId;
        this.publicKey = publicKey;
        this.identityGeneration = identityGeneration;
        this.identitySigningPublicKey = identitySigningPublicKey;
        this.identityKeyAlgorithm = identityKeyAlgorithm;
        this.accountKeyAlgorithm = accountKeyAlgorithm;
        this.signedAt = signedAt;
        this.accountKeySignature = accountKeySignature;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public long getAccountKeyVersion() {
        return accountKeyVersion;
    }

    public long getIdentityGeneration() {
        return identityGeneration;
    }

    public String getIdentitySigningPublicKey() {
        return identitySigningPublicKey;
    }

    public String getIdentityKeyAlgorithm() {
        return identityKeyAlgorithm;
    }

    public String getAccountKeyAlgorithm() {
        return accountKeyAlgorithm;
    }

    public Instant getSignedAt() {
        return signedAt;
    }

    public String getAccountKeySignature() {
        return accountKeySignature;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(
            String publicKey,
            long accountKeyVersion,
            long identityGeneration,
            String identitySigningPublicKey,
            String identityKeyAlgorithm,
            String accountKeyAlgorithm,
            Instant signedAt,
            String accountKeySignature,
            Instant updatedAt
    ) {
        this.publicKey = publicKey;
        this.accountKeyVersion = accountKeyVersion;
        this.identityGeneration = identityGeneration;
        this.identitySigningPublicKey = identitySigningPublicKey;
        this.identityKeyAlgorithm = identityKeyAlgorithm;
        this.accountKeyAlgorithm = accountKeyAlgorithm;
        this.signedAt = signedAt;
        this.accountKeySignature = accountKeySignature;
        this.updatedAt = updatedAt;
    }
}
