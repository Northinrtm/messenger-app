package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;

public record UserEncryptionRecoverySnapshotRequest(
        @NotBlank
        String snapshotPayloadJson,
        @NotBlank
        String wrappedIdentityRecordJson
) {
}
