package com.north.messenger.api.dto;

import java.util.List;

public record ChatOpenResponse(
        ChatSummaryResponse chat,
        List<MessageResponse> initialMessages,
        String initialMessagesNextCursor,
        List<String> confirmedPendingOutgoingClientMessageIds
) {
}
