package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_encryption_recovery_snapshots")
public class UserEncryptionRecoverySnapshot {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true, updatable = false)
    private UUID userId;

    @Column(name = "snapshot_payload_json", nullable = false, columnDefinition = "text")
    private String snapshotPayloadJson;

    @Column(name = "wrapped_identity_record_json", nullable = false, columnDefinition = "text")
    private String wrappedIdentityRecordJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEncryptionRecoverySnapshot() {
    }

    public UserEncryptionRecoverySnapshot(
            UUID id,
            UUID userId,
            String snapshotPayloadJson,
            String wrappedIdentityRecordJson,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = id;
        this.userId = userId;
        this.snapshotPayloadJson = snapshotPayloadJson;
        this.wrappedIdentityRecordJson = wrappedIdentityRecordJson;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getSnapshotPayloadJson() {
        return snapshotPayloadJson;
    }

    public String getWrappedIdentityRecordJson() {
        return wrappedIdentityRecordJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(String snapshotPayloadJson, String wrappedIdentityRecordJson, Instant updatedAt) {
        this.snapshotPayloadJson = snapshotPayloadJson;
        this.wrappedIdentityRecordJson = wrappedIdentityRecordJson;
        this.updatedAt = updatedAt;
    }
}
