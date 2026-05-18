package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

@Schema(description = "Payload used to add users to an existing group chat")
public record AddGroupParticipantsRequest(
        @Schema(description = "Usernames to add to the group")
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
