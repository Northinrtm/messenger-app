package com.north.messenger.api.dto;

public record PushNotificationConfigResponse(
        boolean enabled,
        String publicKey
) {
}
