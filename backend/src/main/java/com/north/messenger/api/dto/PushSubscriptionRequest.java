package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

@Schema(description = "Browser Web Push subscription payload")
public record PushSubscriptionRequest(
        @Schema(description = "Push endpoint URL provided by the browser")
        @NotBlank
        @Size(max = 2048)
        String endpoint,
        @Schema(description = "Optional browser-provided expiration timestamp")
        Instant expirationTime,
        @Schema(description = "Web Push public keys associated with the endpoint")
        @Valid
        @NotNull
        PushSubscriptionKeys keys
) {
    @Schema(description = "Web Push client key material")
    public record PushSubscriptionKeys(
            @Schema(description = "P-256 Diffie-Hellman public key")
            @NotBlank
            @Size(max = 512)
            String p256dh,
            @Schema(description = "Authentication secret")
            @NotBlank
            @Size(max = 256)
            String auth
    ) {
    }
}
