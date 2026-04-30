package com.north.messenger.api.dto;

import java.util.UUID;

public record UserEncryptionAccountKeyResolveResponse(
        UUID userId,
        String publicKey
) {
}
