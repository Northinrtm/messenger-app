package com.north.messenger.config;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.security.JwtService;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
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

    private final JwtService jwtService;
    private final AuthService authService;
    private final ChatParticipantRepository chatParticipantRepository;

    public WebSocketAuthChannelInterceptor(
            JwtService jwtService,
            AuthService authService,
            ChatParticipantRepository chatParticipantRepository
    ) {
        this.jwtService = jwtService;
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
            authorizeSubscription(accessor);
        }

        return message;
    }

    private Message<?> authenticate(Message<?> message, StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new MessagingException("WebSocket Authorization header is required");
        }

        String username = jwtService.extractUsername(authorization.substring(7));
        UserAccount user = authService.requireUser(username);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                user.getUsername(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        accessor.setUser(authentication);
        return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        Principal principal = accessor.getUser();
        if (principal == null) {
            throw new MessagingException("WebSocket authentication required");
        }

        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHAT_TOPIC_PREFIX)) {
            return;
        }

        String rawChatId = destination.substring(CHAT_TOPIC_PREFIX.length());
        UUID chatId = UUID.fromString(rawChatId);
        UserAccount user = authService.requireUser(principal.getName());
        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())) {
            throw new MessagingException("Access denied for this subscription");
        }
    }
}

