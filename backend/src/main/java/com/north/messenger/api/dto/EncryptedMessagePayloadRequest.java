package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record EncryptedMessagePayloadRequest(
        @NotBlank
        @Size(max = 120)
        String scheme,
        @NotBlank
        String ciphertext,
        @NotBlank
        @Size(max = 255)
        String iv,
        @NotEmpty
        Map<String, String> encryptedKeysByUserId
) {
}
