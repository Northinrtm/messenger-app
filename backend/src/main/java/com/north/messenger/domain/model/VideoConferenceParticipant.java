package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "video_conference_participants")
public class VideoConferenceParticipant {

    @Id
    private UUID id;

    @Column(name = "conference_id", nullable = false, updatable = false)
    private UUID conferenceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "invited_at", nullable = false, updatable = false)
    private Instant invitedAt;

    protected VideoConferenceParticipant() {
    }

    public VideoConferenceParticipant(UUID id, UUID conferenceId, UUID userId, Instant invitedAt) {
        this.id = id;
        this.conferenceId = conferenceId;
        this.userId = userId;
        this.invitedAt = invitedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getConferenceId() {
        return conferenceId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getInvitedAt() {
        return invitedAt;
    }
}
