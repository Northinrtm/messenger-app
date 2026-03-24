package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateChatDraftRequest(
        @NotNull
        @Size(max = 2000)
        String content
) {
}
