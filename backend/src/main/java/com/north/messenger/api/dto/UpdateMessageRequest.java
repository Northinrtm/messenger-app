package com.north.messenger.api.dto;

import jakarta.validation.Valid;

public record UpdateMessageRequest(
        @Valid
        PlainMessagePayloadRequest plainPayload
) {
}
