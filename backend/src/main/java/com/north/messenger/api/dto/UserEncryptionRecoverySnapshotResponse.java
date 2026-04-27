package com.north.messenger.api.dto;

import java.time.Instant;

public record UserEncryptionRecoverySnapshotResponse(
        String snapshotPayloadJson,
        String wrappedIdentityRecordJson,
        long wrappedPasswordVersion,
        Instant createdAt,
        Instant updatedAt
) {
}
