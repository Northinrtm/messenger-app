package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "conference_recordings")
public class ConferenceRecording {

    @Id
    @Column(name = "conference_id", nullable = false, updatable = false)
    private UUID conferenceId;

    @Column(name = "stored_filename", nullable = false, length = 220)
    private String storedFilename;

    @Column(name = "mime_type", nullable = false, length = 120)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "uploaded_by_user_id", nullable = false, updatable = false)
    private UUID uploadedByUserId;

    protected ConferenceRecording() {
    }

    public ConferenceRecording(
            UUID conferenceId,
            String storedFilename,
            String mimeType,
            long sizeBytes,
            Instant createdAt,
            UUID uploadedByUserId
    ) {
        this.conferenceId = conferenceId;
        this.storedFilename = storedFilename;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.createdAt = createdAt;
        this.uploadedByUserId = uploadedByUserId;
    }

    public UUID getConferenceId() {
        return conferenceId;
    }

    public String getStoredFilename() {
        return storedFilename;
    }

    public String getMimeType() {
        return mimeType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public UUID getUploadedByUserId() {
        return uploadedByUserId;
    }

    public void replaceStoredFile(String storedFilename, String mimeType, long sizeBytes, Instant createdAt) {
        this.storedFilename = storedFilename;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.createdAt = createdAt;
    }
}
