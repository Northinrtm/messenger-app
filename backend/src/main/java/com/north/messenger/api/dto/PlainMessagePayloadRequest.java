package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;

@Schema(description = "Plain message body payload")
public record PlainMessagePayloadRequest(
        @Schema(description = "Plain-text message content. May be empty when the message has attachments.")
        @Size(max = 65535)
        String content
) {
}
