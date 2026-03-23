package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_sessions")
public class UserSession {

    private static final Duration ACTIVITY_UPDATE_WINDOW = Duration.ofMinutes(1);

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "device_name", nullable = false, length = 160)
    private String deviceName;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected UserSession() {
    }

    public UserSession(
            UUID id,
            UUID userId,
            String tokenHash,
            Instant createdAt,
            Instant lastUsedAt,
            Instant expiresAt,
            String deviceName,
            Instant revokedAt
    ) {
        this.id = id;
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.lastUsedAt = lastUsedAt;
        this.expiresAt = expiresAt;
        this.deviceName = deviceName;
        this.revokedAt = revokedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isActiveAt(Instant instant) {
        return revokedAt == null && expiresAt.isAfter(instant);
    }

    public void rotate(String nextTokenHash, Instant usedAt, Instant expiresAt) {
        this.tokenHash = nextTokenHash;
        this.lastUsedAt = usedAt;
        this.expiresAt = expiresAt;
    }

    public boolean shouldTouchAt(Instant instant) {
        return lastUsedAt.isBefore(instant.minus(ACTIVITY_UPDATE_WINDOW));
    }

    public void touch(Instant usedAt) {
        this.lastUsedAt = usedAt;
    }

    public void revoke(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }
}
