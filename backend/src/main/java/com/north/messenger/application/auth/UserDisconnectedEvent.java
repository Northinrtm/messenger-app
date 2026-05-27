package com.north.messenger.application.auth;

import java.util.UUID;

/**
 * Published when a user's WebSocket session is closed — either normally, by a
 * network error, or when a session is revoked. Listeners can use this event to
 * clean up per-user in-memory state (e.g. typing indicators) without polling.
 */
public record UserDisconnectedEvent(UUID userId) {
}
