package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record EncryptedMessagePayloadRequest(
        @NotBlank
        @Size(max = 120)
        String scheme,
        @NotEmpty
        @Size(max = 512)
        Map<
                @NotBlank @Size(max = 64) String,
                @NotBlank @Size(max = 12000) String
                > encryptedKeysByRecipientId,
        @Size(max = 20000)
        String sharedEnvelope
) {
    public EncryptedMessagePayloadRequest(
            String scheme,
            Map<String, String> encryptedKeysByRecipientId
    ) {
        this(scheme, encryptedKeysByRecipientId, null);
    }
}
