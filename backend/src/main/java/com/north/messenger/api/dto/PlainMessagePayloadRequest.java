package com.north.messenger.api.dto;

import jakarta.validation.constraints.Size;

public record PlainMessagePayloadRequest(
        @Size(max = 65535)
        String content
) {
}
