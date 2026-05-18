package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

@Schema(description = "Pin/unpin payload for a chat")
public record UpdatePinnedMessageRequest(
        @Schema(description = "Message to pin. Null clears the current pinned message.")
        UUID messageId
) {
}
