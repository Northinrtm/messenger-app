package com.north.messenger.api.dto;

import java.util.UUID;

public record UserEncryptionPublicKeyResponse(
        UUID userId,
        String publicKey
) {
}
