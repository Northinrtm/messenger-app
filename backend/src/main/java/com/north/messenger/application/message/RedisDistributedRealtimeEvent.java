package com.north.messenger.application.message;

public record RedisDistributedRealtimeEvent(
        DeliveryMode deliveryMode,
        String destination,
        String username,
        String payload
) {
    public enum DeliveryMode {
        TOPIC,
        USER
    }
}
