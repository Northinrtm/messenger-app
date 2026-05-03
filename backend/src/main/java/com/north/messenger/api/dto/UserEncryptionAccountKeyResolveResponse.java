package com.north.messenger.api.dto;

import java.util.UUID;

public record UserEncryptionAccountKeyResolveResponse(
        UUID userId,
        String publicKey,
        long accountKeyVersion,
        long identityGeneration,
        String identitySigningPublicKey,
        String identityKeyAlgorithm,
        String accountKeyAlgorithm,
        String signedAt,
        String signature
) {
}
