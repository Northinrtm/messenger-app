package com.north.messenger.config;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

@Component
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    private static final String CHAT_TOPIC_PREFIX = "/topic/chats.";
    private static final String SESSION_AUTHENTICATION_ATTRIBUTE =
            WebSocketAuthChannelInterceptor.class.getName() + ".AUTHENTICATION";
    private static final Logger log = LoggerFactory.getLogger(WebSocketAuthChannelInterceptor.class);

    private final AuthService authService;
    private final ChatParticipantRepository chatParticipantRepository;

    public WebSocketAuthChannelInterceptor(
            AuthService authService,
            ChatParticipantRepository chatParticipantRepository
    ) {
        this.authService = authService;
        this.chatParticipantRepository = chatParticipantRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(command)) {
            return authenticate(message, accessor);
        }

        if (StompCommand.SUBSCRIBE.equals(command)) {
            return authorizeSubscription(message, accessor);
        }

        return message;
    }

    private Message<?> authenticate(Message<?> message, StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new MessagingException("WebSocket Authorization header is required");
        }

        UserAccount user = authService.authenticateAccessToken(authorization.substring(7))
                .map(AuthService.AuthenticatedSession::user)
                .orElseThrow(() -> new MessagingException("WebSocket authentication required"));
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                user.getUsername(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        accessor.setUser(authentication);
        storeAuthentication(accessor, authentication);
        return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());
    }

    private Message<?> authorizeSubscription(Message<?> message, StompHeaderAccessor accessor) {
        Principal principal = accessor.getUser();
        boolean principalRestored = false;
        if (principal == null) {
            principal = restorePrincipal(accessor);
            principalRestored = principal != null;
        }
        if (principal == null) {
            log.warn("Dropping websocket subscription without principal destination={}", accessor.getDestination());
            return null;
        }

        Message<?> authorizedMessage = principalRestored
                ? MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders())
                : message;
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHAT_TOPIC_PREFIX)) {
            return authorizedMessage;
        }

        UUID chatId;
        try {
            chatId = extractChatId(destination);
        } catch (MessagingException exception) {
            log.warn(
                    "Dropping websocket subscription with invalid destination user={} destination={}",
                    principal.getName(),
                    destination
            );
            return null;
        }

        UserAccount user = authService.requireAuthenticatedUser(principal.getName());
        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())) {
            log.warn(
                    "Dropping unauthorized websocket subscription user={} chatId={} destination={}",
                    principal.getName(),
                    chatId,
                    destination
            );
            return null;
        }

        return authorizedMessage;
    }

    private void storeAuthentication(StompHeaderAccessor accessor, Principal principal) {
        if (accessor.getSessionAttributes() != null) {
            accessor.getSessionAttributes().put(SESSION_AUTHENTICATION_ATTRIBUTE, principal);
        }
    }

    private Principal restorePrincipal(StompHeaderAccessor accessor) {
        if (accessor.getSessionAttributes() == null) {
            return null;
        }

        Object sessionAuthentication = accessor.getSessionAttributes().get(SESSION_AUTHENTICATION_ATTRIBUTE);
        if (!(sessionAuthentication instanceof Principal restoredPrincipal)) {
            return null;
        }

        accessor.setUser(restoredPrincipal);
        return restoredPrincipal;
    }

    private UUID extractChatId(String destination) {
        String rawChatId = destination.substring(CHAT_TOPIC_PREFIX.length());
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
