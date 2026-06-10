package com.north.messenger.api.dto;

import java.util.List;

/**
 * ICE servers (STUN + optional ephemeral TURN) for a native WebRTC call client.
 */
public record IceServersResponse(List<IceServer> iceServers) {

    public record IceServer(List<String> urls, String username, String credential) {
    }
}
