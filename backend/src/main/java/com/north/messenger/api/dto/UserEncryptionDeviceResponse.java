package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserEncryptionDeviceResponse(
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
        long availableOneTimePrekeys,
        Instant registeredAt,
        Instant lastSeenAt
) {
}
