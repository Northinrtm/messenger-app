package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_push_subscriptions")
public class UserPushSubscription {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "endpoint", nullable = false, unique = true, length = 2048)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = 512)
    private String p256dh;

    @Column(name = "auth", nullable = false, length = 256)
    private String auth;

    @Column(name = "expiration_time")
    private Instant expirationTime;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPushSubscription() {
    }

    public UserPushSubscription(
            UUID id,
            UUID userId,
            String endpoint,
            String p256dh,
            String auth,
            Instant expirationTime,
            String userAgent,
            Instant createdAt
    ) {
        this.id = id;
        this.userId = userId;
        this.endpoint = endpoint;
        this.p256dh = p256dh;
        this.auth = auth;
        this.expirationTime = expirationTime;
        this.userAgent = userAgent;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public String getP256dh() {
        return p256dh;
    }

    public String getAuth() {
        return auth;
    }

    public Instant getExpirationTime() {
        return expirationTime;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(
            UUID userId,
            String p256dh,
            String auth,
            Instant expirationTime,
            String userAgent,
            Instant updatedAt
    ) {
        this.userId = userId;
        this.p256dh = p256dh;
        this.auth = auth;
        this.expirationTime = expirationTime;
        this.userAgent = userAgent;
        this.updatedAt = updatedAt;
    }
}
