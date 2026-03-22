package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateGroupChatRequest(
        @NotBlank
        @Size(min = 2, max = 120)
        String title,
        @NotEmpty
        @Size(max = 50)
        List<
                @NotBlank
                @Pattern(
                        regexp = "^[a-zA-Z0-9_.-]{3,24}$",
                        message = "Username must be 3-24 characters and use letters, numbers, dot, underscore or dash"
                )
                String> participantUsernames
) {
}
