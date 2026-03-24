package com.north.messenger.application.message;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TypingServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private SimpMessagingTemplate messagingTemplate;
    private TypingService typingService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        typingService = new TypingService(authService, chatService, messagingTemplate);
    }

    @Test
    void shouldBroadcastTypingEventToChatTopic() {
        UUID chatId = UUID.randomUUID();
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(authService.toParticipant(user)).thenReturn(new ParticipantResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                null,
                true
        ));

        typingService.publishTyping(chatId, "north", true);

        verify(chatService).requireChatMembership(chatId, user);
        verify(messagingTemplate).convertAndSend(eq("/topic/chats." + chatId + ".typing"), any(Object.class));
    }

    @Test
    void shouldReturnOtherTypingParticipantsForChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount viewer = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount otherUser = new UserAccount(
                UUID.randomUUID(),
                "user2",
                "User 2",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(viewer);
        when(authService.requireAuthenticatedUser("user2")).thenReturn(otherUser);
        when(chatService.findParticipants(chatId)).thenReturn(java.util.List.of(viewer, otherUser));
        when(authService.toParticipant(otherUser)).thenReturn(new ParticipantResponse(
                otherUser.getId(),
                otherUser.getUsername(),
                otherUser.getDisplayName(),
                null,
                true
        ));

        typingService.publishTyping(chatId, "user2", true);

        org.assertj.core.api.Assertions.assertThat(typingService.listTypingParticipants(chatId, "north"))
                .extracting(ParticipantResponse::id)
                .containsExactly(otherUser.getId());
    }
}
