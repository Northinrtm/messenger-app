package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CreateVideoConferenceRequest(
        @NotBlank
        @Size(min = 2, max = 120)
        String title,
        @NotNull
        Instant scheduledAt,
        @NotNull
        @Size(max = 50)
        List<
                @NotBlank
                @Pattern(
                        regexp = "^[a-zA-Z0-9_.-]{3,24}$",
                        message = "Username must be 3-24 characters and use letters, numbers, dot, underscore or dash"
                )
                String> participantUsernames,
        @Schema(description = "Optional group chat id; when set, conference members are derived from current chat membership")
        UUID chatId
) {
    public CreateVideoConferenceRequest(
            String title,
            Instant scheduledAt,
            List<String> participantUsernames
    ) {
        this(title, scheduledAt, participantUsernames, null);
    }
}
