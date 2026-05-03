package com.north.messenger.api.dto;

import java.time.Instant;

public record UserEncryptionAccountKeyResponse(
        String publicKey,
        long accountKeyVersion,
        long identityGeneration,
        String identitySigningPublicKey,
        String identityKeyAlgorithm,
        String accountKeyAlgorithm,
        String signedAt,
        String signature,
        Instant createdAt,
        Instant updatedAt
) {
}
