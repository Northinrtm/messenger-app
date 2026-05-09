package com.north.messenger.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserMailboxRequest(
        @NotBlank
        @Email
        @Size(max = 320)
        String email
) {
}
