package com.north.messenger.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank
        @Pattern(regexp = "^[A-Za-z][A-Za-z0-9_]{2,23}$", message = "Username must be 3-24 characters, start with a letter, and use only letters, numbers or underscore")
        String username,
        @NotBlank
        @Email(message = "Email must be valid")
        @Size(max = 320, message = "Email must be 320 characters or fewer")
        @Pattern(regexp = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", message = "Email must use a valid address format")
        String email,
        @NotBlank
        @Size(min = 2, max = 40)
        @Pattern(regexp = "^(?=.*[\\p{L}\\p{N}])[\\p{L}\\p{N} ._'\\-]{2,40}$", message = "Display name must contain letters or numbers and may use spaces, dot, underscore, apostrophe or dash")
        String displayName,
        @NotBlank
        @Size(min = 8, max = 120, message = "Password must be at least 8 characters long")
        @Pattern(regexp = ".*\\p{L}.*", message = "Password must contain at least one letter")
        String password
) {
}
