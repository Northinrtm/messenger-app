package com.north.messenger.config;

import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Component
public class WebSocketAuthHandshakeInterceptor implements HandshakeInterceptor {

    public static final String SESSION_HANDSHAKE_AUTHORIZATION_ATTRIBUTE =
            WebSocketAuthHandshakeInterceptor.class.getName() + ".AUTHORIZATION";

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        String authorization = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(authorization)) {
            attributes.put(SESSION_HANDSHAKE_AUTHORIZATION_ATTRIBUTE, authorization);
        }

        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
        // Nothing to clean up after the handshake completes.
    }
}
