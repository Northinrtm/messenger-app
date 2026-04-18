package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserEncryptionDeviceBundleResponse(
        UUID userId,
        UUID deviceId,
        String deviceName,
        String identityKey,
        String identityKeyAlgorithm,
        String identitySignatureKey,
        String identitySignatureKeyAlgorithm,
        int signedPrekeyId,
        String signedPrekeyPublicKey,
        String signedPrekeySignature,
        String signedPrekeyAlgorithm,
        UserEncryptionDevicePrekeyResponse oneTimePrekey,
        Instant registeredAt,
        Instant lastSeenAt
) {
}
