package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_rooms")
public class ChatRoom {

    @Id
    private UUID id;

    @Column(name = "title")
    private String title;

    @Column(name = "is_direct", nullable = false)
    private boolean direct;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatRoom() {
    }

    public ChatRoom(UUID id, String title, boolean direct, Instant createdAt) {
        this.id = id;
        this.title = title;
        this.direct = direct;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public boolean isDirect() {
        return direct;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

