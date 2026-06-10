package com.north.messenger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Inbound WebRTC call signaling sent by a client to {@code /app/calls/signal}.
 * The server relays it to {@code targetUsername} without storing any call state.
 */
public record CallSignalRequest(
        @NotBlank @Size(max = 100) String callId,
        @NotBlank @Size(max = 64) String targetUsername,
        @NotBlank @Size(max = 16) String type,
        @Size(max = 20_000) String sdp,
        @Size(max = 4_000) String candidate,
        @Size(max = 120) String callerDisplayName
) {
}
