package com.north.messenger.application.message;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;

class TypingServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private TypingStateStore typingStateStore;
    private TypingService typingService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        typingStateStore = mock(TypingStateStore.class);
        typingService = new TypingService(
                authService,
                chatService,
                realtimeMessagingGateway,
                typingStateStore,
                10_000
        );
    }

    @Test
    void shouldBroadcastTypingEventToChatTopic() {
        UUID chatId = UUID.randomUUID();
        UserAccount user = testUserAccount(
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
        verify(typingStateStore).markTyping(eq(chatId), eq(user.getId()), any(Instant.class));
        verify(realtimeMessagingGateway).sendToTopic(eq("/topic/chats." + chatId + ".typing"), any(Object.class));
    }

    @Test
    void shouldReturnOtherTypingParticipantsForChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount viewer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount otherUser = testUserAccount(
                UUID.randomUUID(),
                "user2",
                "User 2",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(viewer);
        when(authService.requireAuthenticatedUser("user2")).thenReturn(otherUser);
        when(chatService.findParticipants(chatId)).thenReturn(java.util.List.of(viewer, otherUser));
        when(typingStateStore.listTypingUserIds(eq(chatId), any(Instant.class))).thenReturn(Set.of(otherUser.getId()));
        when(authService.toParticipant(otherUser)).thenReturn(new ParticipantResponse(
                otherUser.getId(),
                otherUser.getUsername(),
                otherUser.getDisplayName(),
                null,
                true
        ));

        assertThat(typingService.listTypingParticipants(chatId, "north"))
                .extracting(ParticipantResponse::id)
                .containsExactly(otherUser.getId());
    }

    @Test
    void shouldPurgeExpiredTypingEntriesWithoutReadingChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount viewer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount otherUser = testUserAccount(
                UUID.randomUUID(),
                "user2",
                "User 2",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(viewer);
        when(authService.requireAuthenticatedUser("user2")).thenReturn(otherUser);
        when(chatService.findParticipants(chatId)).thenReturn(java.util.List.of(viewer, otherUser));
        when(typingStateStore.listTypingUserIds(eq(chatId), any(Instant.class))).thenReturn(Set.of());
        when(authService.toParticipant(otherUser)).thenReturn(new ParticipantResponse(
                otherUser.getId(),
                otherUser.getUsername(),
                otherUser.getDisplayName(),
                null,
                true
        ));

        typingService.purgeExpiredTypingEntries(Instant.now().plusSeconds(30));

        verify(typingStateStore).purgeExpiredEntries(any(Instant.class));
        assertThat(typingService.listTypingParticipants(chatId, "north")).isEmpty();
    }
}
