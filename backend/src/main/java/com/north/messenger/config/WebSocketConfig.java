package com.north.messenger.config;

import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthChannelInterceptor authChannelInterceptor;
    private final WebSocketAuthHandshakeInterceptor authHandshakeInterceptor;
    private final WebSocketOutboundSecurityInterceptor outboundSecurityInterceptor;
    private final WebSocketSessionTrackingDecoratorFactory sessionTrackingDecoratorFactory;
    private final String[] allowedOrigins;
    private final int messageSizeLimitBytes;
    private final int sendBufferSizeLimitBytes;
    private final int sendTimeLimitMs;
    private final String brokerMode;
    private final String brokerRelayHost;
    private final int brokerRelayPort;
    private final String brokerRelayClientLogin;
    private final String brokerRelayClientPasscode;
    private final String brokerRelaySystemLogin;
    private final String brokerRelaySystemPasscode;
    private final String brokerRelayVirtualHost;
    private final long brokerRelaySystemHeartbeatSendIntervalMs;
    private final long brokerRelaySystemHeartbeatReceiveIntervalMs;

    public WebSocketConfig(
            WebSocketAuthChannelInterceptor authChannelInterceptor,
            WebSocketAuthHandshakeInterceptor authHandshakeInterceptor,
            WebSocketOutboundSecurityInterceptor outboundSecurityInterceptor,
            WebSocketSessionTrackingDecoratorFactory sessionTrackingDecoratorFactory,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String[] allowedOrigins,
            @Value("${app.realtime.websocket.message-size-limit-bytes:8388608}") int messageSizeLimitBytes,
            @Value("${app.realtime.websocket.send-buffer-size-limit-bytes:8388608}") int sendBufferSizeLimitBytes,
            @Value("${app.realtime.websocket.send-time-limit-ms:20000}") int sendTimeLimitMs,
            @Value("${app.realtime.broker.mode:simple}") String brokerMode,
            @Value("${app.realtime.broker.relay.host:localhost}") String brokerRelayHost,
            @Value("${app.realtime.broker.relay.port:61613}") int brokerRelayPort,
            @Value("${app.realtime.broker.relay.client-login:}") String brokerRelayClientLogin,
            @Value("${app.realtime.broker.relay.client-passcode:}") String brokerRelayClientPasscode,
            @Value("${app.realtime.broker.relay.system-login:}") String brokerRelaySystemLogin,
            @Value("${app.realtime.broker.relay.system-passcode:}") String brokerRelaySystemPasscode,
            @Value("${app.realtime.broker.relay.virtual-host:}") String brokerRelayVirtualHost,
            @Value("${app.realtime.broker.relay.system-heartbeat-send-interval-ms:10000}") long brokerRelaySystemHeartbeatSendIntervalMs,
            @Value("${app.realtime.broker.relay.system-heartbeat-receive-interval-ms:10000}") long brokerRelaySystemHeartbeatReceiveIntervalMs
    ) {
        this.authChannelInterceptor = authChannelInterceptor;
        this.authHandshakeInterceptor = authHandshakeInterceptor;
        this.outboundSecurityInterceptor = outboundSecurityInterceptor;
        this.sessionTrackingDecoratorFactory = sessionTrackingDecoratorFactory;
        this.allowedOrigins = allowedOrigins;
        this.messageSizeLimitBytes = messageSizeLimitBytes;
        this.sendBufferSizeLimitBytes = sendBufferSizeLimitBytes;
        this.sendTimeLimitMs = sendTimeLimitMs;
        this.brokerMode = brokerMode;
        this.brokerRelayHost = brokerRelayHost;
        this.brokerRelayPort = brokerRelayPort;
        this.brokerRelayClientLogin = brokerRelayClientLogin;
        this.brokerRelayClientPasscode = brokerRelayClientPasscode;
        this.brokerRelaySystemLogin = brokerRelaySystemLogin;
        this.brokerRelaySystemPasscode = brokerRelaySystemPasscode;
        this.brokerRelayVirtualHost = brokerRelayVirtualHost;
        this.brokerRelaySystemHeartbeatSendIntervalMs = brokerRelaySystemHeartbeatSendIntervalMs;
        this.brokerRelaySystemHeartbeatReceiveIntervalMs = brokerRelaySystemHeartbeatReceiveIntervalMs;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .addInterceptors(authHandshakeInterceptor)
                .setAllowedOriginPatterns(allowedOrigins);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        if ("relay".equalsIgnoreCase(brokerMode)) {
            var relay = registry.enableStompBrokerRelay("/topic", "/queue")
                    .setRelayHost(brokerRelayHost)
                    .setRelayPort(brokerRelayPort)
                    .setClientLogin(brokerRelayClientLogin)
                    .setClientPasscode(brokerRelayClientPasscode)
                    .setSystemLogin(brokerRelaySystemLogin)
                    .setSystemPasscode(brokerRelaySystemPasscode)
                    .setSystemHeartbeatSendInterval(brokerRelaySystemHeartbeatSendIntervalMs)
                    .setSystemHeartbeatReceiveInterval(brokerRelaySystemHeartbeatReceiveIntervalMs);
            if (!brokerRelayVirtualHost.isBlank()) {
                relay.setVirtualHost(brokerRelayVirtualHost);
            }
        } else {
            registry.enableSimpleBroker("/topic", "/queue");
        }
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authChannelInterceptor);
        registration.taskExecutor()
                .corePoolSize(4)
                .maxPoolSize(16)
                .queueCapacity(200)
                .keepAliveSeconds(60);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(outboundSecurityInterceptor);
        registration.taskExecutor()
                .corePoolSize(8)
                .maxPoolSize(32)
                .queueCapacity(500)
                .keepAliveSeconds(60);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setMessageSizeLimit(messageSizeLimitBytes);
        registry.setSendBufferSizeLimit(sendBufferSizeLimitBytes);
        registry.setSendTimeLimit(sendTimeLimitMs);
        registry.addDecoratorFactory(sessionTrackingDecoratorFactory);
    }

    @Bean
    ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(messageSizeLimitBytes);
        container.setMaxBinaryMessageBufferSize(messageSizeLimitBytes);
        container.setAsyncSendTimeout((long) sendTimeLimitMs);
        return container;
    }
}
