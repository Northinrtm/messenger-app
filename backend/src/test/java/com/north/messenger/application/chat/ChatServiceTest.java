package com.north.messenger.application.chat;

import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateGroupChatRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.MessagePreviewService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatPinnedMessage;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ChatRoomModerator;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserChatReactionAttention;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatPinnedMessageRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomModeratorRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.UserChatReactionAttentionRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.data.domain.Pageable;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatServiceTest {

    private AuthService authService;
    private ChatRoomRepository chatRoomRepository;
    private ChatRoomBanRepository chatRoomBanRepository;
    private ChatRoomModeratorRepository chatRoomModeratorRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private ChatPinnedMessageRepository chatPinnedMessageRepository;
    private ChatMessageRepository chatMessageRepository;
    private MessageReactionRepository messageReactionRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private UserAccountRepository userAccountRepository;
    private UserArchivedChatRepository userArchivedChatRepository;
    private UserDeletedChatRepository userDeletedChatRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private UserChatReactionAttentionRepository userChatReactionAttentionRepository;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private MessengerTelemetry telemetry;
    private DirectChatCreationLockService directChatCreationLockService;
    private ApplicationEventPublisher eventPublisher;
    private MessagePreviewService messagePreviewService;
    private ChatService chatService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatRoomBanRepository = mock(ChatRoomBanRepository.class);
        chatRoomModeratorRepository = mock(ChatRoomModeratorRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        chatPinnedMessageRepository = mock(ChatPinnedMessageRepository.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        messageReactionRepository = mock(MessageReactionRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userArchivedChatRepository = mock(UserArchivedChatRepository.class);
        userDeletedChatRepository = mock(UserDeletedChatRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        userChatReactionAttentionRepository = mock(UserChatReactionAttentionRepository.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        telemetry = mock(MessengerTelemetry.class);
        directChatCreationLockService = mock(DirectChatCreationLockService.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        messagePreviewService = mock(MessagePreviewService.class);
        chatService = new ChatService(
                authService,
                chatRoomRepository,
                chatRoomBanRepository,
                chatRoomModeratorRepository,
                chatParticipantRepository,
                chatPinnedMessageRepository,
                chatMessageRepository,
                messageReactionRepository,
                messageReceiptRepository,
                userAccountRepository,
                userArchivedChatRepository,
                userDeletedChatRepository,
                userDeletedMessageRepository,
                userChatReactionAttentionRepository,
                realtimeMessagingGateway,
                telemetry,
                directChatCreationLockService,
                eventPublisher,
                messagePreviewService
        );
        when(messagePreviewService.summarizeMessagePreview(any(ChatMessage.class)))
                .thenReturn("Latest message");
        when(userArchivedChatRepository.save(any(UserArchivedChat.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userDeletedChatRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(userDeletedChatRepository.findByUserIdAndChatId(any(UUID.class), any(UUID.class))).thenReturn(Optional.empty());
        when(chatRoomBanRepository.findAllByChatId(any(UUID.class))).thenReturn(List.of());
        when(chatRoomBanRepository.existsByChatIdAndUserId(any(UUID.class), any(UUID.class))).thenReturn(false);
        when(chatRoomModeratorRepository.findAllByChatId(any(UUID.class))).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(userChatReactionAttentionRepository.existsByUserIdAndChatId(any(UUID.class), any(UUID.class)))
                .thenReturn(false);
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                any(UUID.class),
                any(UUID.class),
                any(Instant.class),
                any(Pageable.class)
        )).thenReturn(List.of());
    }

    @Test
    void updateArchivedChatStateShouldPersistMembershipScopedArchive() {
        UserAccount user = testUserAccount(
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
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
    void listChatsShouldExposePlainLastMessagePreview() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
        ChatMessage latestMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "latest message",
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
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(user.getId()),
                eq(ownMembership.getJoinedAt()),
                any(Pageable.class)
        ))
                .thenReturn(List.of(latestMessage));
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).lastMessage()).isEqualTo("Latest message");
    }

    @Test
    void listChatsShouldFlagReactionsOnTheLastMessageFromAnotherParticipant() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
        ChatMessage latestMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "latest message",
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
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(user.getId()),
                eq(ownMembership.getJoinedAt()),
                any(Pageable.class)
        ))
                .thenReturn(List.of(latestMessage));
        when(messageReactionRepository.findAllByMessageIdIn(List.of(latestMessage.getId()))).thenReturn(List.of(
                new MessageReaction(
                        UUID.randomUUID(),
                        latestMessage.getId(),
                        peer.getId(),
                        "LIKE",
                        Instant.parse("2026-03-22T12:01:00Z")
                )
        ));
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).lastMessageHasReactions()).isTrue();
    }

    @Test
    void listChatsShouldOrderReactionAttentionMessageIdsByServerOrder() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
        ChatMessage earliest = withServerOrder(new ChatMessage(
                UUID.randomUUID(), chatId, user.getId(), "first own message", Instant.parse("2026-03-22T12:00:00Z")
        ), 10L);
        ChatMessage middle = withServerOrder(new ChatMessage(
                UUID.randomUUID(), chatId, user.getId(), "fifth own message", Instant.parse("2026-03-22T12:05:00Z")
        ), 50L);
        ChatMessage latest = withServerOrder(new ChatMessage(
                UUID.randomUUID(), chatId, user.getId(), "tenth own message", Instant.parse("2026-03-22T12:10:00Z")
        ), 100L);

        // Reactions were added in a different order than the messages appear in the chat.
        UserChatReactionAttention attention = new UserChatReactionAttention(
                UUID.randomUUID(), user.getId(), chatId, Instant.parse("2026-03-22T13:00:00Z")
        );
        attention.touch(Instant.parse("2026-03-22T13:00:00Z"), latest.getId());
        attention.touch(Instant.parse("2026-03-22T13:01:00Z"), earliest.getId());
        attention.touch(Instant.parse("2026-03-22T13:02:00Z"), middle.getId());

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
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId), eq(user.getId()), eq(ownMembership.getJoinedAt()), any(Pageable.class)
        )).thenReturn(List.of(latest));
        when(userChatReactionAttentionRepository.findByUserIdAndChatId(user.getId(), chatId))
                .thenReturn(Optional.of(attention));
        when(chatMessageRepository.findAllById(attention.getMessageIdList()))
                .thenReturn(List.of(latest, earliest, middle));
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).reactionAttentionMessageIds())
                .containsExactly(earliest.getId(), middle.getId(), latest.getId());
    }

    @Test
    void updatePinnedMessageShouldToggleMultiplePinnedMessagesWithoutDroppingExistingPins() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant ownMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                user.getId(),
                Instant.parse("2026-03-21T12:00:00Z")
        );
        ChatParticipant peerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                Instant.parse("2026-03-21T12:00:00Z")
        );
        ChatMessage firstMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "first pinned message",
                Instant.parse("2026-03-22T12:00:00Z")
        ), 11L);
        ChatMessage secondMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "second pinned message",
                Instant.parse("2026-03-22T12:05:00Z")
        ), 12L);
        List<ChatPinnedMessage> pinnedMessages = new ArrayList<>();
        java.util.Map<UUID, ChatMessage> messagesById = java.util.Map.of(
                firstMessage.getId(), firstMessage,
                secondMessage.getId(), secondMessage
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId())))
                .thenReturn(List.of(user, peer));
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(user.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(user.getId()),
                eq(ownMembership.getJoinedAt()),
                any(Pageable.class)
        )).thenReturn(List.of());
        when(chatMessageRepository.findById(firstMessage.getId())).thenReturn(Optional.of(firstMessage));
        when(chatMessageRepository.findById(secondMessage.getId())).thenReturn(Optional.of(secondMessage));
        when(chatMessageRepository.findAllById(any())).thenAnswer(invocation -> {
            Iterable<UUID> ids = invocation.getArgument(0);
            List<ChatMessage> matchedMessages = new ArrayList<>();
            ids.forEach(id -> {
                ChatMessage message = messagesById.get(id);
                if (message != null) {
                    matchedMessages.add(message);
                }
            });
            return matchedMessages;
        });
        when(userDeletedMessageRepository.findAllByUserIdAndMessageIdIn(eq(user.getId()), any()))
                .thenReturn(List.of());
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatPinnedMessageRepository.findByChatIdAndMessageId(eq(chatId), any(UUID.class)))
                .thenAnswer(invocation -> pinnedMessages.stream()
                        .filter(pinnedMessage -> pinnedMessage.getMessageId().equals(invocation.getArgument(1)))
                        .findFirst());
        when(chatPinnedMessageRepository.findAllByChatIdOrderByPinnedAtDescIdDesc(chatId))
                .thenAnswer(invocation -> pinnedMessages.stream()
                        .sorted(Comparator.comparing(ChatPinnedMessage::getPinnedAt)
                                .reversed()
                                .thenComparing(ChatPinnedMessage::getId, Comparator.reverseOrder()))
                        .toList());
        when(chatPinnedMessageRepository.save(any(ChatPinnedMessage.class))).thenAnswer(invocation -> {
            ChatPinnedMessage pinnedMessage = invocation.getArgument(0);
            Instant pinnedAt = pinnedMessages.isEmpty()
                    ? Instant.parse("2026-03-22T12:10:00Z")
                    : Instant.parse("2026-03-22T12:11:00Z");
            ChatPinnedMessage storedPinnedMessage = new ChatPinnedMessage(
                    pinnedMessage.getId(),
                    pinnedMessage.getChatId(),
                    pinnedMessage.getMessageId(),
                    pinnedAt
            );
            pinnedMessages.add(storedPinnedMessage);
            return storedPinnedMessage;
        });
        doAnswer(invocation -> {
            UUID deletedMessageId = invocation.getArgument(1);
            pinnedMessages.removeIf(pinnedMessage -> pinnedMessage.getMessageId().equals(deletedMessageId));
            return null;
        }).when(chatPinnedMessageRepository).deleteByChatIdAndMessageId(eq(chatId), any(UUID.class));

        ChatSummaryResponse firstPinnedResponse = chatService.updatePinnedMessage("north", chatId, firstMessage.getId());
        ChatSummaryResponse secondPinnedResponse = chatService.updatePinnedMessage("north", chatId, secondMessage.getId());
        ChatSummaryResponse unpinnedSecondResponse = chatService.updatePinnedMessage("north", chatId, secondMessage.getId());

        assertThat(firstPinnedResponse.pinnedMessages()).extracting(message -> message.id())
                .containsExactly(firstMessage.getId());
        assertThat(secondPinnedResponse.pinnedMessages()).extracting(message -> message.id())
                .containsExactly(secondMessage.getId(), firstMessage.getId());
        assertThat(secondPinnedResponse.pinnedMessage()).isNotNull();
        assertThat(secondPinnedResponse.pinnedMessage().id()).isEqualTo(secondMessage.getId());
        assertThat(unpinnedSecondResponse.pinnedMessages()).extracting(message -> message.id())
                .containsExactly(firstMessage.getId());
        assertThat(unpinnedSecondResponse.pinnedMessage()).isNotNull();
        assertThat(unpinnedSecondResponse.pinnedMessage().id()).isEqualTo(firstMessage.getId());
        assertThat(room.getPinnedMessageId()).isEqualTo(firstMessage.getId());
    }

    @Test
    void listChatsShouldShowDeletedUserTitleForDirectChatsLeftWithOneMember() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant ownMembership = new ChatParticipant(UUID.randomUUID(), chatId, user.getId(), Instant.parse("2026-03-21T12:00:00Z"));

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(user.getId())).thenReturn(List.of(ownMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(user.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(user.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId()))).thenReturn(List.of(user));
        when(authService.resolveOnlineByUserIds(List.of(user.getId()))).thenReturn(java.util.Map.of(user.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(user.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(user, true)).thenReturn(new com.north.messenger.api.dto.ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).title()).isEqualTo("Deleted user");
    }

    @Test
    void deleteChatForSelfShouldPersistUserScopedDeletion() {
        UserAccount user = testUserAccount(
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

        verify(userDeletedChatRepository).save(any());
        verify(userArchivedChatRepository).deleteByUserIdAndChatId(user.getId(), chatId);
        verify(eventPublisher).publishEvent(new ChatRemovalDeferredEvent(chatId, List.of("north")));
    }

    @Test
    void notifyChatUpdatedShouldSkipUsersWhoDeletedChatForSelf() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
    void notifyChatUpdatedShouldReuseSharedLatestMessageAcrossAudience() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
        ChatMessage latestMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                "latest message",
                Instant.parse("2026-03-22T12:00:00Z")
        ), 42L);

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(userDeletedChatRepository.findAllByChatId(chatId)).thenReturn(List.of());
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(chatMessageRepository.findLatestByChatId(eq(chatId), any(Pageable.class)))
                .thenReturn(List.of(latestMessage));
        when(userDeletedMessageRepository.findAllByMessageIdAndUserIdIn(
                eq(latestMessage.getId()),
                eq(List.of(user.getId(), peer.getId()))
        )).thenReturn(List.of());
        when(authService.toParticipant(user, true)).thenReturn(new ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        chatService.notifyChatUpdated(chatId);

        ArgumentCaptor<ChatSummaryResponse> summaryCaptor = ArgumentCaptor.forClass(ChatSummaryResponse.class);
        verify(realtimeMessagingGateway, times(2)).sendToUser(any(), eq("/queue/chats"), summaryCaptor.capture());
        assertThat(summaryCaptor.getAllValues())
                .extracting(ChatSummaryResponse::lastMessageServerOrder)
                .containsOnly(42L);
        verify(chatMessageRepository, never()).findLatestVisibleByChatIdAndUserId(any(UUID.class), any(UUID.class), any(Pageable.class));
    }

    @Test
    void notifyChatUpdatedShouldFallbackForUsersWhoDeletedLatestMessage() {
        UserAccount user = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
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
        ChatMessage latestMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                user.getId(),
                "latest message",
                Instant.parse("2026-03-22T12:01:00Z")
        ), 42L);
        ChatMessage previousMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                user.getId(),
                "previous message",
                Instant.parse("2026-03-22T12:00:00Z")
        ), 41L);

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(user.getId(), peer.getId()))).thenReturn(List.of(user, peer));
        when(userDeletedChatRepository.findAllByChatId(chatId)).thenReturn(List.of());
        when(authService.resolveOnlineByUserIds(List.of(user.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(user.getId(), true, peer.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(chatMessageRepository.findLatestByChatId(eq(chatId), any(Pageable.class)))
                .thenReturn(List.of(latestMessage));
        when(userDeletedMessageRepository.findAllByMessageIdAndUserIdIn(
                eq(latestMessage.getId()),
                eq(List.of(user.getId(), peer.getId()))
        )).thenReturn(List.of(new UserDeletedMessage(
                UUID.randomUUID(),
                peer.getId(),
                latestMessage.getId(),
                Instant.parse("2026-03-22T12:02:00Z")
        )));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(peer.getId()),
                eq(peerMembership.getJoinedAt()),
                any(Pageable.class)
        ))
                .thenReturn(List.of(previousMessage));
        when(authService.toParticipant(user, true)).thenReturn(new ParticipantResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarUrl(), true
        ));
        when(authService.toParticipant(peer, true)).thenReturn(new ParticipantResponse(
                peer.getId(), peer.getUsername(), peer.getDisplayName(), peer.getAvatarUrl(), true
        ));

        chatService.notifyChatUpdated(chatId);

        ArgumentCaptor<String> usernameCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<ChatSummaryResponse> summaryCaptor = ArgumentCaptor.forClass(ChatSummaryResponse.class);
        verify(realtimeMessagingGateway, times(2)).sendToUser(usernameCaptor.capture(), eq("/queue/chats"), summaryCaptor.capture());

        int ownIndex = usernameCaptor.getAllValues().indexOf("north");
        int peerIndex = usernameCaptor.getAllValues().indexOf("alice");
        assertThat(summaryCaptor.getAllValues().get(ownIndex).lastMessageServerOrder()).isEqualTo(42L);
        assertThat(summaryCaptor.getAllValues().get(peerIndex).lastMessageServerOrder()).isEqualTo(41L);
        verify(chatMessageRepository).findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(peer.getId()),
                eq(peerMembership.getJoinedAt()),
                any(Pageable.class)
        );
        verify(chatMessageRepository, never()).findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(user.getId()),
                any(Instant.class),
                any(Pageable.class)
        );
    }

    @Test
    void joinGroupViaInviteShouldAddMembershipAndRestoreVisibility() {
        UserAccount invitedUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount existingMember = testUserAccount(
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
                .thenAnswer(invocation -> memberships.stream()
                        .anyMatch(candidate -> candidate.getUserId().equals(invitedUser.getId())));
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, invitedUser.getId()))
                .thenAnswer(invocation -> memberships.stream()
                        .filter(candidate -> candidate.getUserId().equals(invitedUser.getId()))
                        .findFirst());
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
        assertThat(room.getMembershipVersion()).isEqualTo(1L);
        verify(userArchivedChatRepository).deleteByUserIdAndChatId(invitedUser.getId(), chatId);
        verify(userDeletedChatRepository).deleteByChatIdAndUserIdIn(chatId, List.of(invitedUser.getId()));
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void createDirectChatShouldReuseCanonicalDirectPair() {
        UUID lowUserId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID highUserId = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
        UserAccount currentUser = testUserAccount(
                highUserId,
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
                lowUserId,
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(
                chatId,
                null,
                true,
                Instant.parse("2026-03-21T12:00:00Z"),
                currentUser.getId(),
                peer.getId()
        );
        ChatParticipant currentMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                Instant.parse("2026-03-21T12:00:00Z")
        );
        ChatParticipant peerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                Instant.parse("2026-03-21T12:00:01Z")
        );
        ParticipantResponse currentParticipant = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        ParticipantResponse peerParticipant = new ParticipantResponse(
                peer.getId(),
                peer.getUsername(),
                peer.getDisplayName(),
                peer.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(authService.requireExistingUser("alice")).thenReturn(peer);
        when(chatRoomRepository.findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(lowUserId, highUserId))
                .thenReturn(Optional.of(room));
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(peerMembership, currentMembership));
        when(userAccountRepository.findAllByIdIn(List.of(peer.getId(), currentUser.getId())))
                .thenReturn(List.of(peer, currentUser));
        when(authService.resolveOnlineByUserIds(List.of(peer.getId(), currentUser.getId())))
                .thenReturn(java.util.Map.of(peer.getId(), true, currentUser.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(currentUser.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(currentUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(peer.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(currentParticipant);
        when(authService.toParticipant(peer, true)).thenReturn(peerParticipant);

        var response = chatService.createDirectChat("north", new com.north.messenger.api.dto.CreateDirectChatRequest("alice"));

        assertThat(response.id()).isEqualTo(chatId);
        assertThat(response.direct()).isTrue();
        assertThat(room.getDirectUserLowId()).isEqualTo(lowUserId);
        assertThat(room.getDirectUserHighId()).isEqualTo(highUserId);
        verify(directChatCreationLockService).lockForPair(lowUserId, highUserId);
        verify(chatRoomRepository).findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(lowUserId, highUserId);
        verify(chatRoomRepository, never()).findDirectChatByParticipantIds(currentUser.getId(), peer.getId());
        verify(chatRoomRepository, never()).save(any(ChatRoom.class));
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void createDirectChatShouldReopenDeletedDirectChatFromDeletionTime() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:05:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(
                chatId,
                null,
                true,
                Instant.parse("2026-03-21T12:00:00Z"),
                currentUser.getId(),
                peer.getId()
        );
        Instant originalJoinedAt = Instant.parse("2026-03-21T12:00:00Z");
        Instant deletedAt = Instant.parse("2026-03-23T09:30:00Z");
        ChatParticipant currentMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                originalJoinedAt
        );
        ChatParticipant peerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                peer.getId(),
                originalJoinedAt
        );
        UserDeletedChat deletedChat = new UserDeletedChat(
                UUID.randomUUID(),
                currentUser.getId(),
                chatId,
                deletedAt
        );
        ParticipantResponse currentParticipant = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        ParticipantResponse peerParticipant = new ParticipantResponse(
                peer.getId(),
                peer.getUsername(),
                peer.getDisplayName(),
                peer.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(authService.requireExistingUser("alice")).thenReturn(peer);
        when(chatRoomRepository.findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(any(UUID.class), any(UUID.class)))
                .thenReturn(Optional.of(room));
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId()))
                .thenReturn(Optional.of(currentMembership));
        when(userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId))
                .thenReturn(Optional.of(deletedChat));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(currentMembership, peerMembership));
        when(userAccountRepository.findAllByIdIn(List.of(currentUser.getId(), peer.getId())))
                .thenReturn(List.of(currentUser, peer));
        when(authService.resolveOnlineByUserIds(List.of(currentUser.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(currentUser.getId(), true, peer.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(currentUser.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(currentUser.getId()),
                eq(deletedAt),
                any(Pageable.class)
        )).thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(currentParticipant);
        when(authService.toParticipant(peer, true)).thenReturn(peerParticipant);

        var response = chatService.createDirectChat("north", new com.north.messenger.api.dto.CreateDirectChatRequest("alice"));

        assertThat(response.id()).isEqualTo(chatId);
        assertThat(response.lastMessage()).isNull();
        assertThat(currentMembership.getJoinedAt()).isEqualTo(deletedAt);
        verify(userDeletedChatRepository).delete(deletedChat);
        verify(userArchivedChatRepository).deleteByUserIdAndChatId(currentUser.getId(), chatId);
        verify(chatMessageRepository).findLatestVisibleByChatIdAndUserIdCreatedAfter(
                eq(chatId),
                eq(currentUser.getId()),
                eq(deletedAt),
                any(Pageable.class)
        );
        verify(chatMessageRepository, never()).findLatestVisibleByChatIdAndUserId(
                eq(chatId),
                eq(currentUser.getId()),
                any(Pageable.class)
        );
    }

    @Test
    void createDirectChatShouldCreateRoomWithoutLegacyKeyBootstrap() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount peer = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:05:00Z")
        );
        ParticipantResponse currentParticipant = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        ParticipantResponse peerParticipant = new ParticipantResponse(
                peer.getId(),
                peer.getUsername(),
                peer.getDisplayName(),
                peer.getAvatarUrl(),
                true
        );
        var savedRoom = new java.util.concurrent.atomic.AtomicReference<ChatRoom>();
        var memberships = new ArrayList<ChatParticipant>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(authService.requireExistingUser("alice")).thenReturn(peer);
        when(chatRoomRepository.findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(any(UUID.class), any(UUID.class)))
                .thenReturn(Optional.empty());
        when(chatRoomRepository.findDirectChatByParticipantIds(currentUser.getId(), peer.getId()))
                .thenReturn(Optional.empty());
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> {
            ChatRoom room = invocation.getArgument(0);
            savedRoom.set(room);
            return room;
        });
        when(chatRoomRepository.findById(any(UUID.class))).thenAnswer(invocation ->
                Optional.ofNullable(savedRoom.get()).filter(room -> room.getId().equals(invocation.getArgument(0))));
        when(chatParticipantRepository.save(any(ChatParticipant.class))).thenAnswer(invocation -> {
            ChatParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(any(UUID.class))).thenAnswer(invocation ->
                memberships.stream()
                        .filter(membership -> membership.getChatId().equals(invocation.getArgument(0)))
                        .toList());
        when(chatParticipantRepository.existsByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()))).thenReturn(true);
        when(userAccountRepository.findAllByIdIn(List.of(currentUser.getId(), peer.getId())))
                .thenReturn(List.of(currentUser, peer));
        when(authService.resolveOnlineByUserIds(List.of(currentUser.getId(), peer.getId())))
                .thenReturn(java.util.Map.of(currentUser.getId(), true, peer.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(any(UUID.class))).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(any(UUID.class), any())).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(any(UUID.class), eq(peer.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(currentParticipant);
        when(authService.toParticipant(peer, true)).thenReturn(peerParticipant);

        var response = chatService.createDirectChat("north", new com.north.messenger.api.dto.CreateDirectChatRequest("alice"));

        assertThat(response.direct()).isTrue();
        assertThat(savedRoom.get()).isNotNull();
        assertThat(savedRoom.get().getMembershipVersion()).isEqualTo(1L);
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(savedRoom.get().getId()));
    }

    @Test
    void createGroupChatShouldAllowCreatingGroupWithoutAdditionalParticipants() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        ParticipantResponse currentParticipant = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        var savedRoom = new java.util.concurrent.atomic.AtomicReference<ChatRoom>();
        var memberships = new ArrayList<ChatParticipant>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> {
            ChatRoom room = invocation.getArgument(0);
            savedRoom.set(room);
            return room;
        });
        when(chatRoomRepository.findById(any(UUID.class))).thenAnswer(invocation ->
                Optional.ofNullable(savedRoom.get()).filter(room -> room.getId().equals(invocation.getArgument(0))));
        when(chatParticipantRepository.save(any(ChatParticipant.class))).thenAnswer(invocation -> {
            ChatParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(any(UUID.class))).thenAnswer(invocation ->
                memberships.stream()
                        .filter(membership -> membership.getChatId().equals(invocation.getArgument(0)))
                        .toList());
        when(chatParticipantRepository.existsByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()))).thenReturn(true);
        when(userAccountRepository.findAllByIdIn(List.of(currentUser.getId()))).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(List.of(currentUser.getId())))
                .thenReturn(java.util.Map.of(currentUser.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(any(UUID.class))).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(any(UUID.class), any())).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(currentParticipant);

        var response = chatService.createGroupChat("north", new CreateGroupChatRequest("Solo room", List.of()));

        assertThat(response.title()).isEqualTo("Solo room");
        assertThat(response.ownerUserId()).isEqualTo(currentUser.getId());
        assertThat(response.moderatorUserIds()).isEmpty();
        assertThat(response.members()).containsExactly(currentParticipant);
        assertThat(memberships).hasSize(1);
        assertThat(memberships.get(0).getUserId()).isEqualTo(currentUser.getId());
        assertThat(savedRoom.get().getMembershipVersion()).isEqualTo(1L);
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(savedRoom.get().getId()));
    }

    @Test
    void createGroupChatShouldTreatInitialParticipantsAsFoundingMembers() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount invitedUser = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:05:00Z")
        );
        ParticipantResponse currentParticipant = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        ParticipantResponse invitedParticipant = new ParticipantResponse(
                invitedUser.getId(),
                invitedUser.getUsername(),
                invitedUser.getDisplayName(),
                invitedUser.getAvatarUrl(),
                false
        );
        var savedRoom = new java.util.concurrent.atomic.AtomicReference<ChatRoom>();
        var memberships = new ArrayList<ChatParticipant>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(authService.requireExistingUser("alice")).thenReturn(invitedUser);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> {
            ChatRoom room = invocation.getArgument(0);
            savedRoom.set(room);
            return room;
        });
        when(chatRoomRepository.findById(any(UUID.class))).thenAnswer(invocation ->
                Optional.ofNullable(savedRoom.get()).filter(room -> room.getId().equals(invocation.getArgument(0))));
        when(chatParticipantRepository.save(any(ChatParticipant.class))).thenAnswer(invocation -> {
            ChatParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(any(UUID.class))).thenAnswer(invocation ->
                memberships.stream()
                        .filter(membership -> membership.getChatId().equals(invocation.getArgument(0)))
                        .toList());
        when(chatParticipantRepository.existsByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()))).thenReturn(true);
        when(userAccountRepository.findAllByIdIn(List.of(currentUser.getId(), invitedUser.getId())))
                .thenReturn(List.of(currentUser, invitedUser));
        when(authService.resolveOnlineByUserIds(List.of(currentUser.getId(), invitedUser.getId())))
                .thenReturn(java.util.Map.of(currentUser.getId(), true, invitedUser.getId(), false));
        when(messageReceiptRepository.countUnreadByChatId(any(UUID.class))).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(any(UUID.class), any())).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(any(UUID.class), eq(currentUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(any(UUID.class), eq(invitedUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(currentParticipant);
        when(authService.toParticipant(invitedUser, false)).thenReturn(invitedParticipant);

        var response = chatService.createGroupChat(
                "north",
                new CreateGroupChatRequest("Project room", List.of("alice"))
        );

        assertThat(response.members()).containsExactly(currentParticipant, invitedParticipant);
        assertThat(memberships).hasSize(2);
        assertThat(memberships.get(0).getJoinedAt()).isEqualTo(memberships.get(1).getJoinedAt());
        assertThat(memberships.stream().map(ChatParticipant::getUserId))
                .containsExactly(currentUser.getId(), invitedUser.getId());
        assertThat(savedRoom.get().getMembershipVersion()).isEqualTo(1L);
    }

    @Test
    void deleteGroupShouldDeferRemovalBroadcastForAllParticipants() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(
                new ChatParticipant(UUID.randomUUID(), chatId, owner.getId(), Instant.parse("2026-04-09T10:00:00Z")),
                new ChatParticipant(UUID.randomUUID(), chatId, member.getId(), Instant.parse("2026-04-09T10:00:01Z"))
        ));
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), member.getId()))).thenReturn(List.of(owner, member));

        chatService.deleteGroup("north", chatId);

        verify(chatRoomRepository).delete(room);
        verify(eventPublisher).publishEvent(new ChatRemovalDeferredEvent(chatId, List.of("north", "alice")));
    }

    @Test
    void banGroupParticipantShouldDeferRemovalAndChatUpdateWhenUserWasMember() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant memberMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownerMembership, memberMembership));
        when(authService.requireExistingUser("alice")).thenReturn(member);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId())).thenReturn(Optional.of(memberMembership));
        when(chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, member.getId())).thenReturn(false);
        when(chatRoomBanRepository.findByChatIdAndUserId(chatId, member.getId())).thenReturn(Optional.empty());
        when(chatRoomBanRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        chatService.banGroupParticipant("north", chatId, "alice");

        assertThat(room.getMembershipVersion()).isEqualTo(1L);
        assertThat(memberMembership.getLeftAt()).isNotNull();
        verify(chatRoomBanRepository).save(any());
        verify(chatParticipantRepository, never()).deleteByChatIdAndUserId(chatId, member.getId());
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void unbanGroupParticipantShouldDeleteBanRecordAndAllowReaddingUser() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ParticipantResponse ownerParticipant = new ParticipantResponse(
                owner.getId(),
                owner.getUsername(),
                owner.getDisplayName(),
                owner.getAvatarUrl(),
                true
        );
        ParticipantResponse invitedParticipant = new ParticipantResponse(
                member.getId(),
                member.getUsername(),
                member.getDisplayName(),
                member.getAvatarUrl(),
                false
        );
        List<ChatParticipant> memberships = new ArrayList<>(List.of(ownerMembership));

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenAnswer(invocation -> List.copyOf(memberships));
        when(authService.requireExistingUser("alice")).thenReturn(member);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatParticipantRepository.save(any(ChatParticipant.class))).thenAnswer(invocation -> {
            ChatParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId()))).thenReturn(List.of(owner));
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), member.getId())))
                .thenReturn(List.of(owner, member));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId(), member.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true, member.getId(), false));
        when(messageReceiptRepository.countUnreadByChatId(any(UUID.class))).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(any(UUID.class), any())).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(
                any(UUID.class),
                eq(owner.getId()),
                any(Pageable.class)
        )).thenReturn(List.of());
        when(authService.toParticipant(owner, true)).thenReturn(ownerParticipant);
        when(authService.toParticipant(member, false)).thenReturn(invitedParticipant);
        when(chatRoomBanRepository.existsByChatIdAndUserId(chatId, member.getId())).thenReturn(false);

        chatService.unbanGroupParticipant("north", chatId, "alice");
        ChatSummaryResponse response = chatService.addGroupParticipants(
                "north",
                chatId,
                new AddGroupParticipantsRequest(List.of("alice"))
        );

        verify(chatRoomBanRepository).deleteByChatIdAndUserId(chatId, member.getId());
        assertThat(response.members()).containsExactly(ownerParticipant, invitedParticipant);
        verify(eventPublisher, times(2)).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void updateGroupChatShouldRenameAndUpdateAvatar() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Old name", false, Instant.parse("2026-03-21T12:00:00Z"));
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                Instant.parse("2026-03-21T12:00:00Z")
        );
        String avatarUrl = "data:image/png;base64," + "A".repeat(1024);

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, currentUser.getId())).thenReturn(true);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(List.of(currentUser.getId()))).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(List.of(currentUser.getId())))
                .thenReturn(java.util.Map.of(currentUser.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(currentUser.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(currentUser.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(currentUser, true)).thenReturn(new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        ));

        var response = chatService.updateGroupChat(
                "north",
                chatId,
                new UpdateGroupChatRequest("New name", avatarUrl, "JOIN_ONLY")
        );

        assertThat(response.title()).isEqualTo("New name");
        assertThat(response.avatarUrl()).isEqualTo(avatarUrl);
        assertThat(room.getTitle()).isEqualTo("New name");
        assertThat(room.getAvatarUrl()).isEqualTo(avatarUrl);
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void updateGroupChatShouldAllowModeratorToRenameAndUpdateAvatarWithoutChangingHistoryPolicy() {
        UserAccount owner = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount moderator = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "Alice",
                "password-hash",
                Instant.parse("2026-03-20T12:05:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Old name", false, Instant.parse("2026-03-21T12:00:00Z"));
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-03-21T12:00:00Z")
        );
        ChatParticipant moderatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                moderator.getId(),
                Instant.parse("2026-03-21T12:00:01Z")
        );
        ChatRoomModerator moderatorRole = new ChatRoomModerator(
                UUID.randomUUID(),
                chatId,
                moderator.getId(),
                owner.getId(),
                Instant.parse("2026-03-21T12:01:00Z")
        );
        String avatarUrl = "data:image/png;base64," + "B".repeat(1024);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(moderator);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, moderator.getId())).thenReturn(true);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownerMembership, moderatorMembership));
        when(chatRoomModeratorRepository.findAllByChatId(chatId)).thenReturn(List.of(moderatorRole));
        when(chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, moderator.getId())).thenReturn(true);
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), moderator.getId())))
                .thenReturn(List.of(owner, moderator));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId(), moderator.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true, moderator.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(moderator.getId(), List.of(chatId)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(owner.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(moderator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(owner, true)).thenReturn(new ParticipantResponse(
                owner.getId(),
                owner.getUsername(),
                owner.getDisplayName(),
                owner.getAvatarUrl(),
                true
        ));
        when(authService.toParticipant(moderator, true)).thenReturn(new ParticipantResponse(
                moderator.getId(),
                moderator.getUsername(),
                moderator.getDisplayName(),
                moderator.getAvatarUrl(),
                true
        ));

        var response = chatService.updateGroupChat(
                "alice",
                chatId,
                new UpdateGroupChatRequest("Moderator rename", avatarUrl, room.getPrejoinHistoryPolicy().name())
        );

        assertThat(response.title()).isEqualTo("Moderator rename");
        assertThat(response.avatarUrl()).isEqualTo(avatarUrl);
        assertThat(response.capabilities().canEditGroup()).isTrue();
        assertThat(response.capabilities().canTogglePrejoinHistory()).isFalse();
        assertThat(room.getTitle()).isEqualTo("Moderator rename");
        assertThat(room.getAvatarUrl()).isEqualTo(avatarUrl);
    }

    @Test
    void leaveGroupShouldRejectOwner() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(ownerMembership));

        assertThatThrownBy(() -> chatService.leaveGroup("north", chatId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Group owner cannot leave the group");

        verify(chatParticipantRepository, never()).deleteByChatIdAndUserId(chatId, owner.getId());
        verify(chatRoomRepository, never()).save(any(ChatRoom.class));
    }

    @Test
    void assignGroupModeratorShouldAllowOwnerToGrantModeratorRole() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant memberMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownerMembership, memberMembership));
        when(authService.requireExistingUser("alice")).thenReturn(member);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId())).thenReturn(Optional.of(memberMembership));
        when(chatRoomModeratorRepository.findByChatIdAndUserId(chatId, member.getId())).thenReturn(Optional.empty());
        when(chatRoomModeratorRepository.save(any(ChatRoomModerator.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), member.getId()))).thenReturn(List.of(owner, member));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId(), member.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true, member.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(owner.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(member.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(owner, true)).thenReturn(new ParticipantResponse(
                owner.getId(), owner.getUsername(), owner.getDisplayName(), owner.getAvatarUrl(), true
        ));
        when(authService.toParticipant(member, true)).thenReturn(new ParticipantResponse(
                member.getId(), member.getUsername(), member.getDisplayName(), member.getAvatarUrl(), true
        ));

        chatService.assignGroupModerator("north", chatId, "alice");

        verify(chatRoomModeratorRepository).save(any(ChatRoomModerator.class));
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void transferGroupOwnershipShouldPromoteModeratorAndKeepPreviousOwnerAsModerator() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount moderator = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant moderatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                moderator.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );
        ChatRoomModerator moderatorRole = new ChatRoomModerator(
                UUID.randomUUID(),
                chatId,
                moderator.getId(),
                owner.getId(),
                Instant.parse("2026-04-09T10:01:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(owner);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, owner.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownerMembership, moderatorMembership));
        when(authService.requireExistingUser("alice")).thenReturn(moderator);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, moderator.getId())).thenReturn(Optional.of(moderatorMembership));
        when(chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, moderator.getId())).thenReturn(true);
        when(chatRoomModeratorRepository.findByChatIdAndUserId(chatId, owner.getId())).thenReturn(Optional.empty());
        when(chatRoomModeratorRepository.findAllByChatId(chatId)).thenReturn(List.of(moderatorRole));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomModeratorRepository.save(any(ChatRoomModerator.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), moderator.getId()))).thenReturn(List.of(owner, moderator));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId(), moderator.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true, moderator.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(owner.getId(), List.of(chatId))).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(owner.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(moderator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(owner, true)).thenReturn(new ParticipantResponse(
                owner.getId(), owner.getUsername(), owner.getDisplayName(), owner.getAvatarUrl(), true
        ));
        when(authService.toParticipant(moderator, true)).thenReturn(new ParticipantResponse(
                moderator.getId(), moderator.getUsername(), moderator.getDisplayName(), moderator.getAvatarUrl(), true
        ));

        var response = chatService.transferGroupOwnership("north", chatId, "alice");

        assertThat(room.getOwnerUserId()).isEqualTo(moderator.getId());
        assertThat(response.ownerUserId()).isEqualTo(moderator.getId());
        verify(chatRoomModeratorRepository).deleteByChatIdAndUserId(chatId, moderator.getId());
        verify(chatRoomModeratorRepository).save(any(ChatRoomModerator.class));
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void updateGroupChatShouldRepairLegacyOwnerAndAllowEarliestMemberToEdit() {
        UserAccount creator = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Legacy group", false, Instant.now());
        ChatParticipant creatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                creator.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant memberMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(creator);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, creator.getId())).thenReturn(true);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(creatorMembership, memberMembership));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userAccountRepository.findAllByIdIn(List.of(creator.getId(), member.getId()))).thenReturn(List.of(creator, member));
        when(authService.resolveOnlineByUserIds(List.of(creator.getId(), member.getId())))
                .thenReturn(java.util.Map.of(creator.getId(), true, member.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(creator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(member.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(creator, true)).thenReturn(new ParticipantResponse(
                creator.getId(), creator.getUsername(), creator.getDisplayName(), creator.getAvatarUrl(), true
        ));
        when(authService.toParticipant(member, true)).thenReturn(new ParticipantResponse(
                member.getId(), member.getUsername(), member.getDisplayName(), member.getAvatarUrl(), true
        ));

        var response = chatService.updateGroupChat(
                "north",
                chatId,
                new UpdateGroupChatRequest("Repaired title", null, "JOIN_ONLY")
        );

        assertThat(response.title()).isEqualTo("Repaired title");
        assertThat(response.ownerUserId()).isEqualTo(creator.getId());
        assertThat(room.getOwnerUserId()).isEqualTo(creator.getId());
        verify(chatRoomRepository, times(2)).save(room);
    }

    private ChatMessage withServerOrder(ChatMessage message, long serverOrder) {
        try {
            java.lang.reflect.Field field = ChatMessage.class.getDeclaredField("serverOrder");
            field.setAccessible(true);
            field.set(message, serverOrder);
            return message;
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Failed to assign serverOrder in test fixture", exception);
        }
    }

    @Test
    void removeGroupParticipantShouldAllowModeratorToRemoveRegularMember() {
        UserAccount owner = testUserAccount(UUID.randomUUID(), "owner", "Owner", "hash", Instant.now());
        UserAccount moderator = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount member = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(owner.getId());
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                owner.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant moderatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                moderator.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );
        ChatParticipant memberMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                Instant.parse("2026-04-09T10:00:02Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(moderator);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, moderator.getId())).thenReturn(true);
        when(chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, moderator.getId())).thenReturn(true);
        when(authService.requireExistingUser("alice")).thenReturn(member);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId))
                .thenReturn(List.of(ownerMembership, moderatorMembership, memberMembership));
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId())).thenReturn(Optional.of(memberMembership));
        when(chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, member.getId())).thenReturn(false);
        when(userAccountRepository.findAllByIdIn(List.of(owner.getId(), moderator.getId()))).thenReturn(List.of(owner, moderator));
        when(authService.resolveOnlineByUserIds(List.of(owner.getId(), moderator.getId())))
                .thenReturn(java.util.Map.of(owner.getId(), true, moderator.getId(), true));
        when(messageReceiptRepository.countUnreadByChatId(chatId)).thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(owner.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(moderator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(owner, true)).thenReturn(new ParticipantResponse(
                owner.getId(), owner.getUsername(), owner.getDisplayName(), owner.getAvatarUrl(), true
        ));
        when(authService.toParticipant(moderator, true)).thenReturn(new ParticipantResponse(
                moderator.getId(), moderator.getUsername(), moderator.getDisplayName(), moderator.getAvatarUrl(), true
        ));

        chatService.removeGroupParticipant("north", chatId, "alice");

        assertThat(room.getMembershipVersion()).isEqualTo(1L);
        assertThat(memberMembership.getLeftAt()).isNotNull();
        verify(chatParticipantRepository, never()).deleteByChatIdAndUserId(chatId, member.getId());
        verify(eventPublisher).publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    @Test
    void listChatsShouldKeepStoredOwnerWhenOwnerIsStillMember() {
        UserAccount creator = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount other = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(other.getId());
        ChatParticipant creatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                creator.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant otherMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                other.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(creator);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(creator.getId())).thenReturn(List.of(creatorMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(creator.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(creatorMembership, otherMembership));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(creator.getId(), List.of(chatId))).thenReturn(List.of());
        when(userAccountRepository.findAllByIdIn(List.of(creator.getId(), other.getId()))).thenReturn(List.of(creator, other));
        when(authService.resolveOnlineByUserIds(List.of(creator.getId(), other.getId())))
                .thenReturn(java.util.Map.of(creator.getId(), true, other.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(creator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(creator, true)).thenReturn(new ParticipantResponse(
                creator.getId(), creator.getUsername(), creator.getDisplayName(), creator.getAvatarUrl(), true
        ));
        when(authService.toParticipant(other, true)).thenReturn(new ParticipantResponse(
                other.getId(), other.getUsername(), other.getDisplayName(), other.getAvatarUrl(), true
        ));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).ownerUserId()).isEqualTo(other.getId());
        assertThat(room.getOwnerUserId()).isEqualTo(other.getId());
        verify(chatRoomRepository, never()).save(room);
    }

    @Test
    void listChatsShouldRepairMissingOwnerToEarliestParticipant() {
        UserAccount creator = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount other = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        ChatParticipant creatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                creator.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant otherMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                other.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(creator);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(creator.getId())).thenReturn(List.of(creatorMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(creator.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(creatorMembership, otherMembership));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(creator.getId(), List.of(chatId))).thenReturn(List.of());
        when(userAccountRepository.findAllByIdIn(List.of(creator.getId(), other.getId()))).thenReturn(List.of(creator, other));
        when(authService.resolveOnlineByUserIds(List.of(creator.getId(), other.getId())))
                .thenReturn(java.util.Map.of(creator.getId(), true, other.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(creator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(creator, true)).thenReturn(new ParticipantResponse(
                creator.getId(), creator.getUsername(), creator.getDisplayName(), creator.getAvatarUrl(), true
        ));
        when(authService.toParticipant(other, true)).thenReturn(new ParticipantResponse(
                other.getId(), other.getUsername(), other.getDisplayName(), other.getAvatarUrl(), true
        ));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).ownerUserId()).isEqualTo(creator.getId());
        assertThat(room.getOwnerUserId()).isEqualTo(creator.getId());
        verify(chatRoomRepository).save(room);
    }

    @Test
    void listChatsShouldRepairOwnerWhenStoredOwnerIsNoLongerMember() {
        UserAccount creator = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UserAccount other = testUserAccount(UUID.randomUUID(), "alice", "Alice", "hash", Instant.now());
        UserAccount removedOwner = testUserAccount(UUID.randomUUID(), "ghost", "Ghost", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Project", false, Instant.now());
        room.updateOwnerUserId(removedOwner.getId());
        ChatParticipant creatorMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                creator.getId(),
                Instant.parse("2026-04-09T10:00:00Z")
        );
        ChatParticipant otherMembership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                other.getId(),
                Instant.parse("2026-04-09T10:00:01Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(creator);
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(creator.getId())).thenReturn(List.of(creatorMembership));
        when(userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(creator.getId())).thenReturn(List.of());
        when(chatRoomRepository.findAllById(List.of(chatId))).thenReturn(List.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(creatorMembership, otherMembership));
        when(messageReceiptRepository.countUnreadByUserIdAndChatIdIn(creator.getId(), List.of(chatId))).thenReturn(List.of());
        when(userAccountRepository.findAllByIdIn(List.of(creator.getId(), other.getId()))).thenReturn(List.of(creator, other));
        when(authService.resolveOnlineByUserIds(List.of(creator.getId(), other.getId())))
                .thenReturn(java.util.Map.of(creator.getId(), true, other.getId(), true));
        when(chatMessageRepository.findLatestVisibleByChatIdAndUserId(eq(chatId), eq(creator.getId()), any(Pageable.class)))
                .thenReturn(List.of());
        when(authService.toParticipant(creator, true)).thenReturn(new ParticipantResponse(
                creator.getId(), creator.getUsername(), creator.getDisplayName(), creator.getAvatarUrl(), true
        ));
        when(authService.toParticipant(other, true)).thenReturn(new ParticipantResponse(
                other.getId(), other.getUsername(), other.getDisplayName(), other.getAvatarUrl(), true
        ));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var chats = chatService.listChats("north");

        assertThat(chats).hasSize(1);
        assertThat(chats.get(0).ownerUserId()).isEqualTo(creator.getId());
        assertThat(room.getOwnerUserId()).isEqualTo(creator.getId());
        verify(chatRoomRepository).save(room);
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

