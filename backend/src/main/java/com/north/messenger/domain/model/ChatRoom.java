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

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "is_direct", nullable = false)
    private boolean direct;

    @Column(name = "direct_user_low_id")
    private UUID directUserLowId;

    @Column(name = "direct_user_high_id")
    private UUID directUserHighId;

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

    public ChatRoom(
            UUID id,
            String title,
            boolean direct,
            Instant createdAt,
            UUID firstDirectUserId,
            UUID secondDirectUserId
    ) {
        this(id, title, direct, createdAt);
        configureDirectPair(firstDirectUserId, secondDirectUserId);
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

    public UUID getDirectUserLowId() {
        return directUserLowId;
    }

    public UUID getDirectUserHighId() {
        return directUserHighId;
    }

    public UUID getOwnerUserId() {
        return ownerUserId;
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

    public void updateOwnerUserId(UUID ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public void updateGroupDetails(String title, String avatarUrl) {
        this.title = title;
        this.avatarUrl = avatarUrl;
    }

    public void configureDirectPair(UUID firstUserId, UUID secondUserId) {
        if (!direct) {
            throw new IllegalStateException("Direct pair can only be assigned to direct chats");
        }
        if (firstUserId == null || secondUserId == null || firstUserId.equals(secondUserId)) {
            throw new IllegalArgumentException("Direct chat requires two distinct users");
        }

        if (firstUserId.toString().compareTo(secondUserId.toString()) < 0) {
            this.directUserLowId = firstUserId;
            this.directUserHighId = secondUserId;
        } else {
            this.directUserLowId = secondUserId;
            this.directUserHighId = firstUserId;
        }
    }
}
