package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpsertChatDraftRequest(
        @NotNull
        @Size(max = 20000)
        String content
) {
}
