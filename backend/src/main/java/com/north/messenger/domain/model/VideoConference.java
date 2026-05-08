package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "video_conferences")
public class VideoConference {

    @Id
    private UUID id;

    @Column(name = "title", nullable = false, length = 120)
    private String title;

    @Column(name = "room_name", unique = true, length = 180)
    private String roomName;

    @Column(name = "chat_id")
    private UUID chatId;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private UUID createdByUserId;

    @Column(name = "scheduled_at", nullable = false)
    private Instant scheduledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    protected VideoConference() {
    }

    public VideoConference(
            UUID id,
            String title,
            String roomName,
            UUID createdByUserId,
            Instant scheduledAt,
            Instant createdAt,
            Instant activatedAt,
            Instant startedAt,
            UUID chatId
    ) {
        this.id = id;
        this.title = title;
        this.roomName = roomName;
        this.chatId = chatId;
        this.createdByUserId = createdByUserId;
        this.scheduledAt = scheduledAt;
        this.createdAt = createdAt;
        this.activatedAt = activatedAt;
        this.startedAt = startedAt;
    }

    public VideoConference(
            UUID id,
            String title,
            String roomName,
            UUID createdByUserId,
            Instant scheduledAt,
            Instant createdAt,
            Instant activatedAt,
            Instant startedAt
    ) {
        this(id, title, roomName, createdByUserId, scheduledAt, createdAt, activatedAt, startedAt, null);
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getRoomName() {
        return roomName;
    }

    public UUID getCreatedByUserId() {
        return createdByUserId;
    }

    public UUID getChatId() {
        return chatId;
    }

    public Instant getScheduledAt() {
        return scheduledAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getEndedAt() {
        return endedAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public boolean isStarted() {
        return startedAt != null;
    }

    public boolean isEnded() {
        return endedAt != null;
    }

    public boolean isJoinAvailable() {
        return roomName != null && !roomName.isBlank() && endedAt == null;
    }

    public void updateDetails(String title, Instant scheduledAt) {
        if (!isEnded() && !isStarted()) {
            this.title = title;
            this.scheduledAt = scheduledAt;
        }
    }

    public void activate(String roomName, Instant activatedAt) {
        if (isEnded() || isStarted()) {
            return;
        }

        if (this.roomName == null) {
            this.roomName = roomName;
        }
        if (this.roomName != null && this.activatedAt == null) {
            this.activatedAt = activatedAt;
        }
    }

    public void clearActivation() {
        if (!isEnded() && !isStarted()) {
            this.roomName = null;
            this.activatedAt = null;
        }
    }

    public void end(Instant endedAt) {
        if (this.endedAt == null) {
            this.endedAt = endedAt;
        }
    }

    public void start(Instant startedAt) {
        if (this.startedAt == null && !isEnded() && isJoinAvailable()) {
            this.startedAt = startedAt;
        }
    }
}
