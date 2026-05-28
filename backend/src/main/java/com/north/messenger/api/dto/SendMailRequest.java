package com.north.messenger.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendMailRequest(
        @Email @NotBlank String to,
        @NotBlank @Size(max = 998) String subject,
        @NotBlank @Size(max = 100000) String body
) {
}
