package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "Confirmation token for an email change request")
public record ConfirmEmailChangeRequest(
        @Schema(description = "The raw email change token from the confirmation link")
        @NotBlank
        String token
) {
}
