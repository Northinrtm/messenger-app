package com.north.messenger.api.dto;

/**
 * Outbound WebRTC call signaling delivered to a client on
 * {@code /user/queue/call-signal}. {@code fromUsername} is stamped from the
 * authenticated sender so callers cannot be spoofed.
 */
public record CallSignalEvent(
        String callId,
        String fromUsername,
        String type,
        String sdp,
        String candidate,
        String callerDisplayName
) {
}
