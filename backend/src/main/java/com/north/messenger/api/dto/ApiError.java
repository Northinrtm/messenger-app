package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(description = "Standard HTTP error payload returned by REST endpoints")
public record ApiError(
        @Schema(description = "Server timestamp when the error response was created")
        Instant timestamp,
        @Schema(description = "HTTP status code")
        int status,
        @Schema(description = "High-level error message")
        String error,
        @Schema(description = "Request path that produced the error")
        String path,
        @Schema(description = "Optional list of validation or domain-specific error details")
        List<String> details
) {
}
