package com.north.messenger.api.dto;

import java.util.UUID;

public record ChatRemovalEventResponse(
        UUID chatId
) {
}
