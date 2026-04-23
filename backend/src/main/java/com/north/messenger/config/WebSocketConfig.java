package com.north.messenger.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthChannelInterceptor authChannelInterceptor;
    private final WebSocketOutboundSecurityInterceptor outboundSecurityInterceptor;
    private final WebSocketSessionTrackingDecoratorFactory sessionTrackingDecoratorFactory;
    private final String[] allowedOrigins;
    private final int messageSizeLimitBytes;
    private final int sendBufferSizeLimitBytes;
    private final int sendTimeLimitMs;

    public WebSocketConfig(
            WebSocketAuthChannelInterceptor authChannelInterceptor,
            WebSocketOutboundSecurityInterceptor outboundSecurityInterceptor,
            WebSocketSessionTrackingDecoratorFactory sessionTrackingDecoratorFactory,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String[] allowedOrigins,
            @Value("${app.realtime.websocket.message-size-limit-bytes:8388608}") int messageSizeLimitBytes,
            @Value("${app.realtime.websocket.send-buffer-size-limit-bytes:8388608}") int sendBufferSizeLimitBytes,
            @Value("${app.realtime.websocket.send-time-limit-ms:20000}") int sendTimeLimitMs
    ) {
        this.authChannelInterceptor = authChannelInterceptor;
        this.outboundSecurityInterceptor = outboundSecurityInterceptor;
        this.sessionTrackingDecoratorFactory = sessionTrackingDecoratorFactory;
        this.allowedOrigins = allowedOrigins;
        this.messageSizeLimitBytes = messageSizeLimitBytes;
        this.sendBufferSizeLimitBytes = sendBufferSizeLimitBytes;
        this.sendTimeLimitMs = sendTimeLimitMs;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authChannelInterceptor);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(outboundSecurityInterceptor);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setMessageSizeLimit(messageSizeLimitBytes);
        registry.setSendBufferSizeLimit(sendBufferSizeLimitBytes);
        registry.setSendTimeLimit(sendTimeLimitMs);
        registry.addDecoratorFactory(sessionTrackingDecoratorFactory);
    }
}
