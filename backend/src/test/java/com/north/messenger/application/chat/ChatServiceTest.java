package com.north.messenger.application.chat;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatServiceTest {

    private AuthService authService;
    private ChatRoomRepository chatRoomRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private ChatMessageRepository chatMessageRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private UserAccountRepository userAccountRepository;
    private UserArchivedChatRepository userArchivedChatRepository;
    private UserDeletedChatRepository userDeletedChatRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private MessengerTelemetry telemetry;
    private ChatService chatService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userArchivedChatRepository = mock(UserArchivedChatRepository.class);
        userDeletedChatRepository = mock(UserDeletedChatRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        telemetry = mock(MessengerTelemetry.class);
        chatService = new ChatService(
                authService,
                chatRoomRepository,
                chatParticipantRepository,
                chatMessageRepository,
                messageReceiptRepository,
                userAccountRepository,
                userArchivedChatRepository,
                userDeletedChatRepository,
                userDeletedMessageRepository,
                realtimeMessagingGateway,
                telemetry
        );
        when(userArchivedChatRepository.save(any(UserArchivedChat.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userDeletedChatRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void updateArchivedChatStateShouldPersistMembershipScopedArchive() {
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(new ChatRoom(chatId, null, true, Instant.now())));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())).thenReturn(true);

        chatService.updateArchivedChatState("north", chatId, true);

        verify(userArchivedChatRepository).save(any(UserArchivedChat.class));
    }

    @Test
    void listChatsShouldIncludeUnreadCountFromReceipts() {
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = new UserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant ownMembership = new ChatParticipant(UUID.randomUUID(), chatId, user.getId(), Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant peerMembership = new ChatParticipant(UUID.randomUUID(), chatId, peer.getId(), Instant.parse("2026-03-21T12:00:00Z"));
        MessageReceiptRepository.ChatUnreadCountView unreadCountView = unreadCountView(chatId, 3L);

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(user.getId())).thenReturn(List.of(ownMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(user.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(user.getId(), List.of(chatId)))
                .thenReturn(List.of(unreadCountView));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(user.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).unreadCount()).isEqualTo(3);
    }

    @Test
    void listChatsShouldMaskEncryptedLastMessagePreview() {
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = new UserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant ownMembership = new ChatParticipant(UUID.randomUUID(), chatId, user.getId(), Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant peerMembership = new ChatParticipant(UUID.randomUUID(), chatId, peer.getId(), Instant.parse("2026-03-21T12:00:00Z"));
        ChatMessage encryptedMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "ciphertext-value",
                "RSA-OAEP-256/AES-GCM",
                "iv-value",
                "{\"dummy\":\"wrapped\"}",
                Instant.parse("2026-03-22T12:00:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(user.getId())).thenReturn(List.of(ownMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(user.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(user.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(user.getId()), any(Pageable.class)))
                .thenReturn(List.of(encryptedMessage));
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).lastMessage()).isEqualTo("Encrypted message");
    }

    @Test
    void deleteChatForSelfShouldPersistUserScopedDeletion() {
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(new ChatRoom(chatId, null, true, Instant.now())));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())).thenReturn(true);

        chatService.deleteChatForSelf("north", chatId);

        ArgumentCaptor<com.north.messenger.api.dto.ChatRemovalEventResponse> eventCaptor =
                ArgumentCaptor.forClass(com.north.messenger.api.dto.ChatRemovalEventResponse.class);
        verify(userDeletedChatRepository).save(any());
        verify(userArchivedChatRepository).deleteByUserIdAndChatId(user.getId(), chatId);
        verify(realtimeMessagingGateway).sendToUser(
                org.mockito.ArgumentMatchers.eq("north"),
                org.mockito.ArgumentMatchers.eq("/queue/chat-removals"),
                eventCaptor.capture()
        );
        assertThat(eventCaptor.getValue().chatId()).isEqualTo(chatId);
    }

    @Test
    void notifyChatUpdatedShouldSkipUsersWhoDeletedChatForSelf() {
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = new UserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant ownMembership = new ChatParticipant(UUID.randomUUID(), chatId, user.getId(), Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant peerMembership = new ChatParticipant(UUID.randomUUID(), chatId, peer.getId(), Instant.parse("2026-03-21T12:00:00Z"));

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(userDeletedChatRepository.findAllByChatId(chatId)).thenReturn(List.of(
                new UserDeletedChat(UUID.randomUUID(), user.getId(), chatId, Instant.now())
        ));
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(peer.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        chatService.notifyChatUpdated(chatId);

        verify(realtimeMessagingGateway).sendToUser(eq("alice"), eq("/queue/chats"), any());
        verify(realtimeMessagingGateway, never()).sendToUser(eq("north"), eq("/queue/chats"), any());
    }

    @Test
    void joinGroupViaInviteShouldAddMembershipAndRestoreVisibility() {
        UserAccount invitedUser = new UserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount existingMember = new UserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.parse("2026-03-21T12:00:00Z"));
        var memberships = new java.util.ArrayList<>(List.of(
                new ChatParticipant(UUID.randomUUID(), chatId, existingMember.getId(), Instant.parse("2026-03-21T12:00:00Z"))
        ));

        when(authService.requireAuthenticatedUser("north")).thenReturn(invitedUser);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, invitedUser.getId()))
                .thenReturn(false, true);
        when(chatParticipantRepository.save(any(ChatParticipant.class))).thenAnswer(invocation -> {
            ChatParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenAnswer(invocation -> List.copyOf(memberships));
        when(userAccountRepository.findAllByIdIn(List.of(existingMember.getId(), invitedUser.getId())))
                .thenReturn(List.of(existingMember, invitedUser));
        when(authService.resolveOnlineByUserIds(List.of(existingMember.getId(), invitedUser.getId())))
                .thenReturn(java.util.Map.of(existingMember.getId(), true, invitedUser.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(invitedUser.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(invitedUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(existingMember.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(existingMember, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                existingMember.getId(),
                existingMember.getUsername(),
                existingMember.getDisplayName(),
                existingMember.getAvatarUrl(),
                true
        ));
        when(authService.toParticipant(invitedUser, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                invitedUser.getId(),
                invitedUser.getUsername(),
                invitedUser.getDisplayName(),
                invitedUser.getAvatarUrl(),
                true
        ));

        var response = chatService.joinGroupViaInvite("north", chatId);

        assertThat(response.id()).isEqualTo(chatId);
        assertThat(response.members()).extracting(com.north.messenger.api.dto.ParticipantResponse::username)
                .containsExactly("alice", "north");
        verify(userArchivedChatRepository).deleteByUserIdAndChatId(invitedUser.getId(), chatId);
        verify(userDeletedChatRepository).deleteByChatIdAndUserIdIn(chatId, List.of(invitedUser.getId()));
    }

    private MessageReceiptRepository.ChatUnreadCountView unreadCountView(UUID chatId, long unreadCount) {
        return new MessageReceiptRepository.ChatUnreadCountView() {
            @Override
            public UUID getChatId() {
                return chatId;
            }

            @Override
            public long getUnreadCount() {
                return unreadCount;
            }
        };
    }
}
