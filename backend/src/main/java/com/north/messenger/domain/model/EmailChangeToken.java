package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "email_change_tokens")
public class EmailChangeToken {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "pending_email", nullable = false, length = 320, updatable = false)
    private String pendingEmail;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected EmailChangeToken() {
    }

    public EmailChangeToken(
            UUID id,
            UUID userId,
            String pendingEmail,
            String tokenHash,
            Instant createdAt,
            Instant expiresAt,
            Instant usedAt
    ) {
        this.id = id;
        this.userId = userId;
        this.pendingEmail = pendingEmail;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPendingEmail() {
        return pendingEmail;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }

    public boolean isUsableAt(Instant instant) {
        return usedAt == null && expiresAt.isAfter(instant);
    }

    public void markUsed(Instant usedAt) {
        this.usedAt = usedAt;
    }
}
