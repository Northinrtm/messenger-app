package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record ChatAttachmentUploadTargetRequest(
        @NotBlank(message = "File name is required")
        String fileName,
        String mimeType,
        @Positive(message = "File size must be positive")
        long sizeBytes
) {
}
