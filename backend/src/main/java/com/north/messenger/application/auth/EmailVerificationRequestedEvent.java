package com.north.messenger.application.auth;

public record EmailVerificationRequestedEvent(
        String email,
        String token
) {
}
