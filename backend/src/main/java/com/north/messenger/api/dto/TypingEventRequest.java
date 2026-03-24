package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotNull;

public record TypingEventRequest(
        @NotNull(message = "typing is required")
        Boolean typing
) {
}
