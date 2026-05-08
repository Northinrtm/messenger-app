package com.north.messenger.application.message;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
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
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatAttachmentBrowserServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatParticipantRepository chatParticipantRepository;
    private ChatAttachmentRepository chatAttachmentRepository;
    private UserAccountRepository userAccountRepository;
    private ChatAttachmentBrowserService chatAttachmentBrowserService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        chatAttachmentBrowserService = new ChatAttachmentBrowserService(
                authService,
                chatService,
                chatParticipantRepository,
                chatAttachmentRepository,
                userAccountRepository
        );
    }

    @Test
    void listAttachmentBrowserPageShouldReturnMappedItemsAndNextCursor() {
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
        AttachmentBrowserItemView first = new AttachmentBrowserItemView(
                UUID.randomUUID(),
                Instant.parse("2026-03-25T12:00:00Z"),
                UUID.randomUUID(),
                Instant.parse("2026-03-25T12:01:00Z"),
                101L,
                sender.getId(),
                "photo-1.jpg",
                "image/jpeg",
                2_048L
        );
        AttachmentBrowserItemView second = new AttachmentBrowserItemView(
                UUID.randomUUID(),
                Instant.parse("2026-03-25T11:59:00Z"),
                UUID.randomUUID(),
                Instant.parse("2026-03-25T12:00:30Z"),
                100L,
                sender.getId(),
                "photo-2.jpg",
                "image/jpeg",
                4_096L
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(membership));
        when(chatAttachmentRepository.findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                isNull(),
                eq(true),
                eq(false),
                isNull(),
                isNull(),
                isNull(),
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

        var response = chatAttachmentBrowserService.listAttachmentBrowserPage(chatId, "north", "photos", null, 1);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).fileName()).isEqualTo("photo-1.jpg");
        assertThat(response.items().get(0).sender().username()).isEqualTo("south");
        assertThat(response.items().get(0).messageServerOrder()).isEqualTo(101L);
        assertThat(response.nextCursor()).isEqualTo(
                first.messageServerOrder() + "|" + first.attachmentCreatedAt() + "|" + first.attachmentId()
        );
        verify(chatAttachmentRepository).findBrowserItems(
                eq(chatId),
                eq(currentUser.getId()),
                isNull(),
                eq(true),
                eq(false),
                isNull(),
                isNull(),
                isNull(),
                eq(PageRequest.of(0, 2))
        );
    }

    @Test
    void listAttachmentBrowserPageShouldRejectMalformedCursor() {
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
                chatAttachmentBrowserService.listAttachmentBrowserPage(chatId, "north", "all", "broken", 20)
        )
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Attachment browser cursor is malformed");
    }

    private record AttachmentBrowserItemView(
            UUID attachmentId,
            Instant attachmentCreatedAt,
            UUID messageId,
            Instant messageCreatedAt,
            Long messageServerOrder,
            UUID senderId,
            String fileName,
            String mimeType,
            long sizeBytes
    ) implements ChatAttachmentRepository.AttachmentBrowserItemView {
        @Override
        public UUID getAttachmentId() {
            return attachmentId;
        }

        @Override
        public Instant getAttachmentCreatedAt() {
            return attachmentCreatedAt;
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
        public String getFileName() {
            return fileName;
        }

        @Override
        public String getMimeType() {
            return mimeType;
        }

        @Override
        public long getSizeBytes() {
            return sizeBytes;
        }
    }
}
