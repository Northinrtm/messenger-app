package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ToggleMessageReactionRequest(
        @NotBlank String key
) {
}
