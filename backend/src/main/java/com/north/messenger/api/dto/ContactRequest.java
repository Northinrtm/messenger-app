package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ContactRequest(
        @NotBlank
        @Pattern(
                regexp = "^[a-zA-Z0-9_.-]{3,24}$",
                message = "Username must be 3-24 characters and use letters, numbers, dot, underscore or dash"
        )
        String username
) {
}
