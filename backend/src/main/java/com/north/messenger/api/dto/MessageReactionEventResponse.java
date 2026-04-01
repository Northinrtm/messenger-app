package com.north.messenger.api.dto;

import java.util.List;
import java.util.UUID;

public record MessageReactionEventResponse(
        UUID messageId,
        UUID chatId,
        List<MessageReactionSummaryResponse> reactions
) {
}
