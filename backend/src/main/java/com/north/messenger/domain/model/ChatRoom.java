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

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "is_direct", nullable = false)
    private boolean direct;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "pinned_message_id")
    private UUID pinnedMessageId;

    @Column(name = "pinned_at")
    private Instant pinnedAt;

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

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public UUID getPinnedMessageId() {
        return pinnedMessageId;
    }

    public Instant getPinnedAt() {
        return pinnedAt;
    }

    public void pinMessage(UUID messageId, Instant pinnedAt) {
        this.pinnedMessageId = messageId;
        this.pinnedAt = pinnedAt;
    }

    public void clearPinnedMessage() {
        this.pinnedMessageId = null;
        this.pinnedAt = null;
    }

    public void updateGroupDetails(String title, String avatarUrl) {
        this.title = title;
        this.avatarUrl = avatarUrl;
    }
}
