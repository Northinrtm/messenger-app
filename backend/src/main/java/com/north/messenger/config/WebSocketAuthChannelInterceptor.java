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

    private static final String APP_DESTINATION_PREFIX = "/app/";
    private static final String CHAT_TOPIC_PREFIX = "/topic/chats.";
    private static final List<String> CLIENT_BLOCKED_SEND_PREFIXES = List.of("/topic/", "/queue/", "/user/");
    private static final String SESSION_AUTHENTICATION_ATTRIBUTE =
            WebSocketAuthChannelInterceptor.class.getName() + ".AUTHENTICATION";
    public static final String SESSION_ID_ATTRIBUTE =
            WebSocketAuthChannelInterceptor.class.getName() + ".SESSION_ID";
    private static final Logger log = LoggerFactory.getLogger(WebSocketAuthChannelInterceptor.class);

    private final AuthService authService;
    private final ChatParticipantRepository chatParticipantRepository;
    private final AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry;

    public WebSocketAuthChannelInterceptor(
            AuthService authService,
            ChatParticipantRepository chatParticipantRepository,
            AuthenticatedWebSocketSessionRegistry webSocketSessionRegistry
    ) {
        this.authService = authService;
        this.chatParticipantRepository = chatParticipantRepository;
        this.webSocketSessionRegistry = webSocketSessionRegistry;
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

        if (StompCommand.DISCONNECT.equals(command)) {
            return message;
        }

        AuthorizedStompSession authorizedSession = restoreAndAuthorizeSession(accessor);
        if (authorizedSession == null) {
            return null;
        }

        Message<?> authorizedMessage = authorizedSession.principalRestored()
                ? MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders())
                : message;
        if (StompCommand.SUBSCRIBE.equals(command)) {
            return authorizeSubscription(authorizedMessage, accessor, authorizedSession.principal());
        }
        if (StompCommand.SEND.equals(command)) {
            return authorizeSend(authorizedMessage, accessor, authorizedSession.principal());
        }

        return authorizedMessage;
    }

    private Message<?> authenticate(Message<?> message, StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new MessagingException("WebSocket Authorization header is required");
        }

        AuthService.AuthenticatedSession authenticatedSession = authService.authenticateAccessToken(authorization.substring(7))
                .orElseThrow(() -> new MessagingException("WebSocket authentication required"));
        UserAccount user = authenticatedSession.user();
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                user.getUsername(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        accessor.setUser(authentication);
        storeAuthentication(accessor, authentication);
        storeSessionId(accessor, authenticatedSession.sessionId());
        webSocketSessionRegistry.register(accessor.getSessionId(), user.getUsername(), user.getId(), authenticatedSession.sessionId());
        return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());
    }

    private Message<?> authorizeSubscription(Message<?> message, StompHeaderAccessor accessor, Principal principal) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHAT_TOPIC_PREFIX)) {
            return message;
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

        return message;
    }

    private Message<?> authorizeSend(Message<?> message, StompHeaderAccessor accessor, Principal principal) {
        String destination = accessor.getDestination();
        if (destination == null || destination.isBlank()) {
            log.warn("Dropping websocket send without destination user={}", principal.getName());
            return null;
        }
        if (CLIENT_BLOCKED_SEND_PREFIXES.stream().anyMatch(destination::startsWith)) {
            log.warn(
                    "Dropping websocket send to broker destination user={} destination={}",
                    principal.getName(),
                    destination
            );
            return null;
        }
        if (!destination.startsWith(APP_DESTINATION_PREFIX)) {
            log.warn(
                    "Dropping websocket send to unsupported destination user={} destination={}",
                    principal.getName(),
                    destination
            );
            return null;
        }
        return message;
    }

    private void storeAuthentication(StompHeaderAccessor accessor, Principal principal) {
        if (accessor.getSessionAttributes() != null) {
            accessor.getSessionAttributes().put(SESSION_AUTHENTICATION_ATTRIBUTE, principal);
        }
    }

    private void storeSessionId(StompHeaderAccessor accessor, UUID sessionId) {
        if (accessor.getSessionAttributes() != null) {
            accessor.getSessionAttributes().put(SESSION_ID_ATTRIBUTE, sessionId);
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

    private UUID restoreSessionId(StompHeaderAccessor accessor) {
        if (accessor.getSessionAttributes() == null) {
            return null;
        }

        Object rawSessionId = accessor.getSessionAttributes().get(SESSION_ID_ATTRIBUTE);
        if (!(rawSessionId instanceof UUID sessionId)) {
            return null;
        }
        return sessionId;
    }

    private AuthorizedStompSession restoreAndAuthorizeSession(StompHeaderAccessor accessor) {
        Principal principal = accessor.getUser();
        boolean principalRestored = false;
        if (principal == null) {
            principal = restorePrincipal(accessor);
            principalRestored = principal != null;
        }
        if (principal == null) {
            log.warn("Dropping websocket frame without principal command={} destination={}", accessor.getCommand(), accessor.getDestination());
            return null;
        }

        UUID sessionId = restoreSessionId(accessor);
        if (sessionId == null) {
            log.warn(
                    "Dropping websocket frame without authenticated session user={} command={} destination={}",
                    principal.getName(),
                    accessor.getCommand(),
                    accessor.getDestination()
            );
            return null;
        }

        if (authService.authenticateSession(principal.getName(), sessionId).isEmpty()) {
            log.warn(
                    "Dropping websocket frame for inactive session user={} sessionId={} command={} destination={}",
                    principal.getName(),
                    sessionId,
                    accessor.getCommand(),
                    accessor.getDestination()
            );
            if (StompCommand.SEND.equals(accessor.getCommand())
                    || StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                throw new MessagingException("WebSocket authenticated session is inactive");
            }
            return null;
        }

        return new AuthorizedStompSession(principal, principalRestored);
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

    private record AuthorizedStompSession(
            Principal principal,
            boolean principalRestored
    ) {
    }
}
