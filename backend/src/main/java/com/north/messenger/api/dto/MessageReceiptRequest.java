package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

@Schema(description = "Payload used to acknowledge message delivery or read state")
public record MessageReceiptRequest(
        @Schema(description = "Ids of the messages whose receipt state should be updated")
        @NotEmpty List<@NotNull UUID> messageIds
) {
}
