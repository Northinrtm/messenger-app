package com.north.messenger.api.dto;

public record MessageStatusResponse(
        MessageDeliveryState state,
        int recipientCount,
        int deliveredCount,
        int readCount
) {
}
