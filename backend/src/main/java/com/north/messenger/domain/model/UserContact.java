package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_contacts")
public class UserContact {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "contact_user_id", nullable = false, updatable = false)
    private UUID contactUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserContact() {
    }

    public UserContact(UUID id, UUID userId, UUID contactUserId, Instant createdAt) {
        this.id = id;
        this.userId = userId;
        this.contactUserId = contactUserId;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getContactUserId() {
        return contactUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
