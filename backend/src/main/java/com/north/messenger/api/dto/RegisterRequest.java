package com.north.messenger.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank
        @Pattern(regexp = "^[a-zA-Z0-9_.-]{3,24}$", message = "Username must be 3-24 characters and use letters, numbers, dot, underscore or dash")
        String username,
        @NotBlank
        @Email(message = "Email must be valid")
        @Size(max = 320, message = "Email must be 320 characters or fewer")
        String email,
        @NotBlank
        @Size(min = 2, max = 40)
        String displayName,
        @NotBlank
        @Size(min = 8, max = 120, message = "Password must be at least 8 characters long")
        String password
) {
}
