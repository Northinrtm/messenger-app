package com.north.messenger.application.message;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageLinkRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatLinkBrowserServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatParticipantRepository chatParticipantRepository;
    private ChatMessageLinkRepository chatMessageLinkRepository;
    private ChatRoomBanRepository chatRoomBanRepository;
    private UserAccountRepository userAccountRepository;
    private ChatLinkBrowserService chatLinkBrowserService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        chatMessageLinkRepository = mock(ChatMessageLinkRepository.class);
        chatRoomBanRepository = mock(ChatRoomBanRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        chatLinkBrowserService = new ChatLinkBrowserService(
                authService,
                chatService,
                chatParticipantRepository,
                chatMessageLinkRepository,
                chatRoomBanRepository,
                userAccountRepository
        );
        when(chatRoomBanRepository.findByChatIdAndUserId(any(), any())).thenReturn(Optional.empty());
    }

    @Test
    void listLinkBrowserPageShouldReturnMappedItemsAndNextCursor() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount sender = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Direct", true, Instant.parse("2026-03-25T11:30:00Z"));
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                Instant.parse("2026-03-25T11:30:00Z")
        );
        LinkBrowserItemView first = new LinkBrowserItemView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                Instant.parse("2026-03-25T12:01:00Z"),
                101L,
                sender.getId(),
                "https://docs.example.com/path",
                0
        );
        LinkBrowserItemView second = new LinkBrowserItemView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                Instant.parse("2026-03-25T12:00:30Z"),
                100L,
                sender.getId(),
                "https://north.test/demo",
                0
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(membership));
        when(chatMessageLinkRepository.findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(membership.getJoinedAt()),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 2))
        )).thenReturn(List.of(first, second));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(sender));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(sender.getId(), true));
        when(authService.toParticipant(sender, true)).thenReturn(new ParticipantResponse(
                sender.getId(),
                sender.getUsername(),
                sender.getDisplayName(),
                sender.getAvatarUrl(),
                true
        ));

        var response = chatLinkBrowserService.listLinkBrowserPage(chatId, "north", null, 1);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).url()).isEqualTo("https://docs.example.com/path");
        assertThat(response.items().get(0).host()).isEqualTo("docs.example.com");
        assertThat(response.items().get(0).sender().username()).isEqualTo("south");
        assertThat(response.nextCursor()).isEqualTo("101|0");
        verify(chatMessageLinkRepository).findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(membership.getJoinedAt()),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 2))
        );
    }

    @Test
    void listLinkBrowserPageShouldApplyVisibleFromForJoinOnlyHistory() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Group", false, Instant.parse("2026-03-25T11:30:00Z"));
        room.updateGroupDetails(
                room.getTitle(),
                room.getAvatarUrl(),
                com.north.messenger.domain.model.ChatPrejoinHistoryPolicy.JOIN_ONLY
        );
        Instant joinedAt = Instant.parse("2026-03-25T12:00:00Z");
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                joinedAt
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(membership));
        when(chatMessageLinkRepository.findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(joinedAt),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 21))
        )).thenReturn(List.of());

        var response = chatLinkBrowserService.listLinkBrowserPage(chatId, "north", null, 20);

        assertThat(response.items()).isEmpty();
        assertThat(response.nextCursor()).isNull();
        verify(chatMessageLinkRepository).findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(joinedAt),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 21))
        );
    }

    @Test
    void listLinkBrowserPageShouldApplyVisibleFromForReopenedDirectChat() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        Instant reopenedAt = Instant.parse("2026-03-25T12:00:00Z");
        ChatRoom room = new ChatRoom(chatId, "Direct", true, Instant.parse("2026-03-25T11:30:00Z"));
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                reopenedAt
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(membership));
        when(chatMessageLinkRepository.findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(reopenedAt),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 21))
        )).thenReturn(List.of());

        var response = chatLinkBrowserService.listLinkBrowserPage(chatId, "north", null, 20);

        assertThat(response.items()).isEmpty();
        assertThat(response.nextCursor()).isNull();
        verify(chatMessageLinkRepository).findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                eq(true),
                eq(reopenedAt),
                eq(false),
                any(Instant.class),
                eq(false),
                any(Long.class),
                any(Integer.class),
                eq(PageRequest.of(0, 21))
        );
    }

    @Test
    void listLinkBrowserPageShouldRejectMalformedCursor() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Direct", true, Instant.parse("2026-03-25T11:30:00Z"));
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                Instant.parse("2026-03-25T11:30:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(membership));

        assertThatThrownBy(() ->
                chatLinkBrowserService.listLinkBrowserPage(chatId, "north", "broken", 20)
        )
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Link browser cursor is malformed");
    }

    private record LinkBrowserItemView(
            UUID linkId,
            UUID messageId,
            Instant messageCreatedAt,
            Long messageServerOrder,
            UUID senderId,
            String url,
            int positionIndex
    ) implements ChatMessageLinkRepository.LinkBrowserItemView {
        @Override
        public UUID getLinkId() {
            return linkId;
        }

        @Override
        public UUID getMessageId() {
            return messageId;
        }

        @Override
        public Instant getMessageCreatedAt() {
            return messageCreatedAt;
        }

        @Override
        public Long getMessageServerOrder() {
            return messageServerOrder;
        }

        @Override
        public UUID getSenderId() {
            return senderId;
        }

        @Override
        public String getUrl() {
            return url;
        }

        @Override
        public int getPositionIndex() {
            return positionIndex;
        }
    }
}
