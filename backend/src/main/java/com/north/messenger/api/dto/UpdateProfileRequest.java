package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank
        @Size(min = 2, max = 40)
        @Pattern(regexp = "^(?=.*[\\p{L}\\p{N}])[\\p{L}\\p{N} ._'\\-]{2,40}$", message = "Display name must contain letters or numbers and may use spaces, dot, underscore, apostrophe or dash")
        String displayName,
        @Size(max = 80)
        String profession,
        Boolean mailEnabled
) {
}
