package com.north.messenger.application.auth;

public record EmailChangeRequestedEvent(
        String pendingEmail,
        String token
) {
}
