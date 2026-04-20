package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;

public record EmailVerificationConfirmRequest(
        @NotBlank String token
) {
}
