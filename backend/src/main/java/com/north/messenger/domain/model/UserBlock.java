package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_blocks")
public class UserBlock {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "blocked_user_id", nullable = false, updatable = false)
    private UUID blockedUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserBlock() {
    }

    public UserBlock(UUID id, UUID userId, UUID blockedUserId, Instant createdAt) {
        this.id = id;
        this.userId = userId;
        this.blockedUserId = blockedUserId;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getBlockedUserId() {
        return blockedUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
