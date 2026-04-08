package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "video_conference_attendance")
public class VideoConferenceAttendance {

    @Id
    private UUID id;

    @Column(name = "conference_id", nullable = false, updatable = false)
    private UUID conferenceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    @Column(name = "left_at")
    private Instant leftAt;

    protected VideoConferenceAttendance() {
    }

    public VideoConferenceAttendance(
            UUID id,
            UUID conferenceId,
            UUID userId,
            UUID sessionId,
            Instant joinedAt,
            Instant lastSeenAt,
            Instant leftAt
    ) {
        this.id = id;
        this.conferenceId = conferenceId;
        this.userId = userId;
        this.sessionId = sessionId;
        this.joinedAt = joinedAt;
        this.lastSeenAt = lastSeenAt;
        this.leftAt = leftAt;
    }

    public UUID getConferenceId() {
        return conferenceId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getLeftAt() {
        return leftAt;
    }

    public void touch(Instant seenAt) {
        lastSeenAt = seenAt;
        leftAt = null;
    }

    public void leave(Instant leftAt) {
        lastSeenAt = leftAt;
        this.leftAt = leftAt;
    }
}
