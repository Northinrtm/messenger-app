package com.north.messenger.application.message;

public record RedisDistributedRealtimeEvent(
        DeliveryMode deliveryMode,
        String destination,
        String username,
        String payload,
        String mac
) {
    public RedisDistributedRealtimeEvent(
            DeliveryMode deliveryMode,
            String destination,
            String username,
            String payload
    ) {
        this(deliveryMode, destination, username, payload, null);
    }

    public enum DeliveryMode {
        TOPIC,
        USER
    }
}
