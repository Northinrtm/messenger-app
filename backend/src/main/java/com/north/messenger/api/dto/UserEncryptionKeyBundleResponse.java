package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserEncryptionKeyBundleResponse(
        UUID userId,
        String publicKey,
        String encryptedPrivateKey,
        String kdfSalt,
        String kdfIv,
        int kdfIterations,
        Instant createdAt,
        Instant updatedAt
) {
}
