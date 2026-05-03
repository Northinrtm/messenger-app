package com.north.messenger.domain.model;

import com.north.messenger.application.e2ee.E2eeMaintenanceJobType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "e2ee_maintenance_outbox")
public class E2eeMaintenanceOutboxEntry {

    private static final int MAX_ERROR_LENGTH = 2_000;

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_type", nullable = false, updatable = false, length = 48)
    private E2eeMaintenanceJobType jobType;

    @Column(name = "dedupe_key", nullable = false, length = 255)
    private String dedupeKey;

    @Column(name = "chat_id")
    private UUID chatId;

    @Column(name = "recipient_user_id")
    private UUID recipientUserId;

    @Column(name = "primary_grantor_user_id")
    private UUID primaryGrantorUserId;

    @Column(name = "chat_membership_version")
    private Long chatMembershipVersion;

    @Column(name = "recipient_account_key_version")
    private Long recipientAccountKeyVersion;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "available_at", nullable = false)
    private Instant availableAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_error", length = MAX_ERROR_LENGTH)
    private String lastError;

    protected E2eeMaintenanceOutboxEntry() {
    }

    public E2eeMaintenanceOutboxEntry(
            UUID id,
            E2eeMaintenanceJobType jobType,
            String dedupeKey,
            UUID chatId,
            UUID recipientUserId,
            UUID primaryGrantorUserId,
            Long chatMembershipVersion,
            Long recipientAccountKeyVersion,
            Instant createdAt
    ) {
        this.id = id;
        this.jobType = jobType;
        this.dedupeKey = dedupeKey;
        this.chatId = chatId;
        this.recipientUserId = recipientUserId;
        this.primaryGrantorUserId = primaryGrantorUserId;
        this.chatMembershipVersion = chatMembershipVersion;
        this.recipientAccountKeyVersion = recipientAccountKeyVersion;
        this.createdAt = createdAt;
        this.availableAt = createdAt;
        this.attemptCount = 0;
    }

    public UUID getId() {
        return id;
    }

    public E2eeMaintenanceJobType getJobType() {
        return jobType;
    }

    public String getDedupeKey() {
        return dedupeKey;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getRecipientUserId() {
        return recipientUserId;
    }

    public UUID getPrimaryGrantorUserId() {
        return primaryGrantorUserId;
    }

    public Long getChatMembershipVersion() {
        return chatMembershipVersion;
    }

    public Long getRecipientAccountKeyVersion() {
        return recipientAccountKeyVersion;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public Instant getAvailableAt() {
        return availableAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getLastError() {
        return lastError;
    }

    public void markProcessed(Instant processedAt) {
        this.attemptCount += 1;
        this.processedAt = processedAt;
        this.availableAt = processedAt;
        this.lastError = null;
    }

    public void markFailed(Instant nextAvailableAt, String error) {
        this.attemptCount += 1;
        this.availableAt = nextAvailableAt;
        this.lastError = abbreviate(error);
    }

    public void reschedule(
            Instant nextAvailableAt,
            UUID primaryGrantorUserId,
            Long chatMembershipVersion,
            Long recipientAccountKeyVersion
    ) {
        this.availableAt = nextAvailableAt;
        if (primaryGrantorUserId != null) {
            this.primaryGrantorUserId = primaryGrantorUserId;
        }
        if (chatMembershipVersion != null) {
            this.chatMembershipVersion = chatMembershipVersion;
        }
        if (recipientAccountKeyVersion != null) {
            this.recipientAccountKeyVersion = recipientAccountKeyVersion;
        }
        this.lastError = null;
    }

    private String abbreviate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() <= MAX_ERROR_LENGTH) {
            return value;
        }
        return value.substring(0, MAX_ERROR_LENGTH);
    }
}
