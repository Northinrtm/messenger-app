package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record UpsertGroupHistoryKeyRequest(
        @NotBlank
        @Size(max = 64)
        String historyKeyId,
        @Size(max = 512)
        Map<
                @NotBlank @Size(max = 64) String,
                @NotBlank @Size(max = 12000) String
                > wrappedKeysByRecipientDeviceId,
        @Size(max = 512)
        Map<
                @NotBlank @Size(max = 64) String,
                @NotBlank @Size(max = 12000) String
                > wrappedKeysByRecipientUserId,
        @Size(max = 12000)
        String serverEscrowGrantPayloadJson
) {
}
