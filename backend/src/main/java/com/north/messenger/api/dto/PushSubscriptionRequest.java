package com.north.messenger.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record PushSubscriptionRequest(
        @NotBlank
        @Size(max = 2048)
        String endpoint,
        Instant expirationTime,
        @Valid
        @NotNull
        PushSubscriptionKeys keys
) {
    public record PushSubscriptionKeys(
            @NotBlank
            @Size(max = 512)
            String p256dh,
            @NotBlank
            @Size(max = 256)
            String auth
    ) {
    }
}
