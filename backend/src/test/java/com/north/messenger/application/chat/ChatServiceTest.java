package com.north.messenger.application.chat;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserChatDraft;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.UserChatDraftRepository;
import com.north.messenger.api.dto.UpdateChatDraftRequest;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatServiceTest {

    private AuthService authService;
    private ChatRoomRepository chatRoomRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private ChatMessageRepository chatMessageRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private UserAccountRepository userAccountRepository;
    private UserChatDraftRepository userChatDraftRepository;
    private UserArchivedChatRepository userArchivedChatRepository;
    private SimpMessagingTemplate messagingTemplate;
    private ChatService chatService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userChatDraftRepository = mock(UserChatDraftRepository.class);
        userArchivedChatRepository = mock(UserArchivedChatRepository.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        chatService = new ChatService(
                authService,
                chatRoomRepository,
                chatParticipantRepository,
                chatMessageRepository,
                messageReceiptRepository,
                userAccountRepository,
                userChatDraftRepository,
                userArchivedChatRepository,
                messagingTemplate
        );
        when(userArchivedChatRepository.save(any(UserArchivedChat.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userChatDraftRepository.save(any(UserChatDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));
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
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(user.getId(), List.of(chatId)))
                .thenReturn(List.of(unreadCountView));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(chatMessageRepository.findTopByChatIdOrderByCreatedAtDesc(chatId)).thenReturn(Optional.empty());
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
    void updateDraftShouldPersistChatScopedDraftForUser() {
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

        chatService.updateDraft("north", chatId, new UpdateChatDraftRequest("draft text"));

        verify(userChatDraftRepository).save(any(UserChatDraft.class));
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
