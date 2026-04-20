package com.north.messenger.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmailVerificationResendRequest(
        @NotBlank
        @Email(message = "Email must be valid")
        @Size(max = 320, message = "Email must be 320 characters or fewer")
        String email
) {
}
