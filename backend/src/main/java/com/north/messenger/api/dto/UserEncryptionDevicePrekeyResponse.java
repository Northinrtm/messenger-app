package com.north.messenger.api.dto;

public record UserEncryptionDevicePrekeyResponse(
        int keyId,
        String publicKey
) {
}
