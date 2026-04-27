package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank
        String currentPassword,
        @NotBlank
        @Size(min = 8, max = 120, message = "Password must be at least 8 characters long")
        String newPassword,
        String recoverySnapshotPayloadJson,
        String recoveryWrappedIdentityRecordJson
) {
}
