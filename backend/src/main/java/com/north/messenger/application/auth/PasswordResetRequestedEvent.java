package com.north.messenger.application.auth;

public record PasswordResetRequestedEvent(
        String email,
        String token
) {
}
