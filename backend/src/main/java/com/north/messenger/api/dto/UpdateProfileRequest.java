package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Editable profile fields for the authenticated user")
public record UpdateProfileRequest(
        @Schema(description = "Display name shown to other users")
        @NotBlank
        @Size(min = 2, max = 40)
        @Pattern(regexp = "^(?=.*[\\p{L}\\p{N}])[\\p{L}\\p{N} ._'\\-]{2,40}$", message = "Display name must contain letters or numbers and may use spaces, dot, underscore, apostrophe or dash")
        String displayName,
        @Schema(description = "Short profile about/profession text")
        @Size(max = 160)
        String profession,
        @Schema(description = "Whether the optional Mail tab should be visible for this user")
        Boolean mailEnabled
) {
}
