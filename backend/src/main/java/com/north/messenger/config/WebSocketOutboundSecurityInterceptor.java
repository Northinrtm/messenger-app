package com.north.messenger.config;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

@Component
public class WebSocketOutboundSecurityInterceptor implements ChannelInterceptor {

    private static final String CHAT_TYPING_TOPIC_PREFIX = "/topic/chats.";
    private static final Logger log = LoggerFactory.getLogger(WebSocketOutboundSecurityInterceptor.class);

    private final AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;
    private final AuthService authService;
    private final ChatParticipantRepository chatParticipantRepository;

    public WebSocketOutboundSecurityInterceptor(
            AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry,
            AuthService authService,
            ChatParticipantRepository chatParticipantRepository
    ) {
        this.webSocketSessionRegistry = webSocketSessionRegistry;
        this.authService = authService;
        this.chatParticipantRepository = chatParticipantRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (!SimpMessageType.MESSAGE.equals(accessor.getMessageType())) {
            return message;
        }

        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHAT_TYPING_TOPIC_PREFIX)) {
            return message;
        }

        String webSocketSessionId = accessor.getSessionId();
        if (webSocketSessionId == null || webSocketSessionId.isBlank()) {
            log.warn("Dropping websocket outbound topic event without session destination={}", destination);
            return null;
        }

        Optional<AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession> registeredSession =
                webSocketSessionRegistry.findByWebSocketSessionId(webSocketSessionId);
        if (registeredSession.isEmpty()) {
            log.warn(
                    "Dropping websocket outbound topic event without registered session destination={} webSocketSessionId={}",
                    destination,
                    webSocketSessionId
            );
            return null;
        }

        AuthenticatedWebSocketSessionRegistry.RegisteredWebSocketSession session = registeredSession.get();
        if (!authService.isSessionActive(session.userId(), session.authSessionId())) {
            webSocketSessionRegistry.unregister(webSocketSessionId);
            log.warn(
                    "Dropping websocket outbound topic event for inactive session user={} authSessionId={} destination={}",
                    session.username(),
                    session.authSessionId(),
                    destination
            );
            return null;
        }

        UUID chatId;
        try {
            chatId = extractChatId(destination);
        } catch (MessagingException exception) {
            log.warn(
                    "Dropping websocket outbound topic event with invalid destination user={} destination={}",
                    session.username(),
                    destination
            );
            return null;
        }

        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, session.userId())) {
            log.warn(
                    "Dropping websocket outbound topic event for non-member user={} chatId={} destination={}",
                    session.username(),
                    chatId,
                    destination
            );
            return null;
        }

        return message;
    }

    private UUID extractChatId(String destination) {
        String rawChatId = destination.substring(CHAT_TYPING_TOPIC_PREFIX.length());
        int suffixIndex = rawChatId.indexOf('.');
        if (suffixIndex >= 0) {
            rawChatId = rawChatId.substring(0, suffixIndex);
        }

        try {
            return UUID.fromString(rawChatId);
        } catch (IllegalArgumentException exception) {
            throw new MessagingException("Invalid chat topic destination", exception);
        }
    }
}
