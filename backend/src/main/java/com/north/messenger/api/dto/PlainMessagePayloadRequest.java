package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PlainMessagePayloadRequest(
        @NotBlank
        @Size(max = 65535)
        String content
) {
}
