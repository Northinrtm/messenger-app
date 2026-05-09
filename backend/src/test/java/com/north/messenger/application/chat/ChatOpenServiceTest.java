package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatOpenResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ChatCapabilitiesResponse;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatOpenServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private MessageService messageService;
    private ChatOpenService chatOpenService;

    ChatOpenServiceTest() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        messageService = mock(MessageService.class);
        chatOpenService = new ChatOpenService(
                authService,
                chatService,
                messageService
        );
    }

    @Test
    void openChatReturnsSummaryAndMessages() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatSummaryResponse chat = new ChatSummaryResponse(
                chatId,
                true,
                "North",
                null,
                "chat-version-1",
                new ChatCapabilitiesResponse(false, false, false, false, false, false, false, false),
                null,
                List.of(),
                List.of(),
                "Latest message",
                Instant.parse("2026-05-03T10:00:00Z"),
                false,
                42L,
                Instant.parse("2026-05-03T10:00:00Z"),
                0,
                3L,
                null,
                List.of(),
                null
        );
        MessageResponse message = new MessageResponse(
                UUID.randomUUID(),
                chatId,
                42L,
                null,
                Instant.parse("2026-05-03T10:00:00Z"),
                null,
                null,
                null,
                null,
                List.of(),
                null,
                List.of()
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.getChatSummaryForUser(chatId, currentUser)).thenReturn(chat);
        when(messageService.listMessagePage(chatId, "north", null, 30, false)).thenReturn(
                new MessagePageResponse(List.of(message), null, List.of())
        );

        ChatOpenResponse response = chatOpenService.openChat("north", chatId, 30, false);

        assertThat(response.chat()).isEqualTo(chat);
        assertThat(response.initialMessages()).containsExactly(message);
        assertThat(response.initialMessagesNextCursor()).isNull();
        assertThat(response.confirmedPendingOutgoingClientMessageIds()).isEmpty();
    }

    @Test
    void openChatKeepsWorkingWithoutExtraLegacyPayload() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatSummaryResponse chat = new ChatSummaryResponse(
                chatId,
                false,
                "Group",
                null,
                "chat-version-2",
                new ChatCapabilitiesResponse(true, true, true, true, true, true, true, false),
                currentUser.getId(),
                List.of(),
                List.of(),
                null,
                null,
                false,
                null,
                Instant.parse("2026-05-03T10:00:00Z"),
                0,
                1L,
                null,
                List.of(),
                "JOIN_ONLY"
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.getChatSummaryForUser(chatId, currentUser)).thenReturn(chat);
        when(messageService.listMessagePage(chatId, "north", null, 30, false)).thenReturn(
                new MessagePageResponse(List.of(), null, List.of())
        );

        ChatOpenResponse response = chatOpenService.openChat("north", chatId, 30, false);

        assertThat(response.chat()).isEqualTo(chat);
        assertThat(response.initialMessages()).isEmpty();
        assertThat(response.initialMessagesNextCursor()).isNull();
        assertThat(response.confirmedPendingOutgoingClientMessageIds()).isEmpty();
    }

    private static UserAccount user(String username) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                username,
                "{noop}password",
                Instant.parse("2026-05-03T09:00:00Z")
        );
    }
}
