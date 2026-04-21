package com.north.messenger.api.dto;

import java.util.Map;

public record EncryptedMessagePayloadResponse(
        String scheme,
        Map<String, String> encryptedKeysByRecipientId,
        String sharedEnvelope,
        String historyEnvelope
) {
    public EncryptedMessagePayloadResponse(
            String scheme,
            Map<String, String> encryptedKeysByRecipientId
    ) {
        this(scheme, encryptedKeysByRecipientId, null, null);
    }

    public EncryptedMessagePayloadResponse(
            String scheme,
            Map<String, String> encryptedKeysByRecipientId,
            String sharedEnvelope
    ) {
        this(scheme, encryptedKeysByRecipientId, sharedEnvelope, null);
    }
}
