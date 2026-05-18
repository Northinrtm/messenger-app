package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;

@Schema(description = "Payload used to edit an existing message")
public record UpdateMessageRequest(
        @Schema(description = "Updated plain-text payload for the message")
        @Valid
        PlainMessagePayloadRequest plainPayload
) {
}
