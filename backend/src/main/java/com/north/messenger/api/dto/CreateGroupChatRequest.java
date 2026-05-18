package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

@Schema(description = "Payload used to create a new group chat")
public record CreateGroupChatRequest(
        @Schema(description = "Group chat title")
        @NotBlank
        @Size(min = 2, max = 120)
        String title,
        @Schema(description = "Initial participant usernames to add to the group")
        @NotNull
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
