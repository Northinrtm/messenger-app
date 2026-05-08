package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record ChatLinkBrowserItemResponse(
        @Schema(description = "Link row id")
        UUID id,
        @Schema(description = "Message that owns this link")
        UUID messageId,
        @Schema(description = "Server-side message order")
        long messageServerOrder,
        @Schema(description = "Time when the source message was sent")
        Instant createdAt,
        @Schema(description = "Sender of the source message")
        ParticipantResponse sender,
        @Schema(description = "Extracted absolute URL")
        String url,
        @Schema(description = "Host portion of the URL")
        String host
) {
}
