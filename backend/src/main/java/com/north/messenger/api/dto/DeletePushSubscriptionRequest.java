package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Payload used to remove one browser push subscription")
public record DeletePushSubscriptionRequest(
        @Schema(description = "Push endpoint URL that should be deleted")
        @NotBlank
        @Size(max = 2048)
        String endpoint
) {
}
