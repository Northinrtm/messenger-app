package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateGroupChatRequest(
        @NotBlank
        @Size(min = 2, max = 120)
        String title,
        String avatarUrl,
        @Size(max = 32)
        String prejoinHistoryPolicy
) {
}
