package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record ChatAttachmentBrowserItemResponse(
        @Schema(description = "Attachment id")
        UUID id,
        @Schema(description = "Message that owns the attachment")
        UUID messageId,
        @Schema(description = "Server-side message order")
        long messageServerOrder,
        @Schema(description = "Time when the message with this attachment was sent")
        Instant createdAt,
        @Schema(description = "Sender of the message that owns this attachment")
        ParticipantResponse sender,
        @Schema(description = "Original file name")
        String fileName,
        @Schema(description = "Attachment mime type")
        String mimeType,
        @Schema(description = "Attachment size in bytes")
        long sizeBytes
) {
}
