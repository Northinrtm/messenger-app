package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record UpdateVideoConferenceRequest(
        @NotBlank
        @Size(min = 2, max = 120)
        String title,
        @NotNull
        Instant scheduledAt
) {
}
