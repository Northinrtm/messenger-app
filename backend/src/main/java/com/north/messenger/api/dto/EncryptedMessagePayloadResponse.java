package com.north.messenger.api.dto;

public record EncryptedMessagePayloadResponse(
        String scheme,
        String sharedEnvelope
) {
}
