package com.north.messenger.api.dto;

import jakarta.validation.constraints.Size;

public record UpdateAvatarRequest(
        @Size(max = 2_000_000)
        String avatarUrl
) {
}
