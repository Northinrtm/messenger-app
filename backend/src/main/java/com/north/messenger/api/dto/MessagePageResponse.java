package com.north.messenger.api.dto;

import java.util.List;

public record MessagePageResponse(
        List<MessageResponse> messages,
        String nextCursor,
        List<String> confirmedPendingOutgoingClientMessageIds
) {
}
