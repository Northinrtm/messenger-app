package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.PlainMessagePayloadRequest;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import com.north.messenger.observability.MessengerTelemetry;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatMessageRepository chatMessageRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private MessageReactionRepository messageReactionRepository;
    private ChatAttachmentRepository chatAttachmentRepository;
    private UserAccountRepository userAccountRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private MessageDispatchOutboxService messageDispatchOutboxService;
    private PendingOutgoingMessageService pendingOutgoingMessageService;
    private MessageContentCryptoService messageContentCryptoService;
    private MessageService messageService;
    private UserAccount currentUser;
    private UserAccount peerUser;
    private ChatRoom room;
    private UUID chatId;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        messageReactionRepository = mock(MessageReactionRepository.class);
        chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        RealtimeMessagingGateway realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
        messageDispatchOutboxService = mock(MessageDispatchOutboxService.class);
        MessengerTelemetry telemetry = mock(MessengerTelemetry.class);
        EntityManager entityManager = mock(EntityManager.class);
        ChatAttachmentService chatAttachmentService = mock(ChatAttachmentService.class);
        ChatMessageLinkService chatMessageLinkService = mock(ChatMessageLinkService.class);
        pendingOutgoingMessageService = mock(PendingOutgoingMessageService.class);
        messageContentCryptoService = mock(MessageContentCryptoService.class);

        MessageSupport messageSupport = new MessageSupport(
                authService,
                chatAttachmentRepository,
                chatMessageRepository,
                chatParticipantRepository,
                messageReceiptRepository,
                messageReactionRepository,
                userAccountRepository,
                userDeletedMessageRepository,
                new MessagePreviewService(chatAttachmentRepository, messageContentCryptoService),
                messageContentCryptoService
        );
        MessageReceiptService messageReceiptService = new MessageReceiptService(
                authService,
                chatService,
                messageReceiptRepository,
                chatMessageRepository,
                userAccountRepository,
                realtimeMessagingGateway,
                messageSupport,
                eventPublisher
        );
        MessageReactionService messageReactionService = new MessageReactionService(
                authService,
                chatService,
                chatMessageRepository,
                messageReactionRepository,
                realtimeMessagingGateway,
                messageSupport,
                eventPublisher
        );
        MessageDispatchService messageDispatchService = new MessageDispatchService(
                chatService,
                chatMessageRepository,
                messageReactionRepository,
                userAccountRepository,
                realtimeMessagingGateway,
                authService,
                telemetry,
                messageSupport,
                mock(PushNotificationDeliveryService.class)
        );
        MessageQueryService messageQueryService = new MessageQueryService(
                authService,
                chatService,
                chatMessageRepository,
                chatParticipantRepository,
                userAccountRepository,
                messageReceiptService,
                messageSupport,
                messageContentCryptoService
        );
        MessageCommandService messageCommandService = new MessageCommandService(
                authService,
                chatService,
                chatMessageRepository,
                messageReceiptRepository,
                userAccountRepository,
                userDeletedMessageRepository,
                eventPublisher,
                telemetry,
                messageSupport,
                messageDispatchOutboxService,
                chatAttachmentService,
                chatMessageLinkService,
                pendingOutgoingMessageService,
                entityManager,
                messageContentCryptoService
        );
        messageService = new MessageService(
                messageQueryService,
                messageCommandService,
                messageReactionService,
                messageReceiptService
        );

        chatId = UUID.randomUUID();
        currentUser = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.parse("2026-04-01T00:00:00Z"));
        peerUser = testUserAccount(UUID.randomUUID(), "peer", "Peer", "hash", Instant.parse("2026-04-01T00:00:00Z"));
        room = new ChatRoom(chatId, null, true, Instant.parse("2026-04-01T00:00:00Z"));

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(authService.toParticipant(currentUser)).thenReturn(
                new ParticipantResponse(currentUser.getId(), currentUser.getUsername(), currentUser.getDisplayName(), currentUser.getAvatarUrl(), true)
        );
        when(authService.toParticipant(peerUser)).thenReturn(
                new ParticipantResponse(peerUser.getId(), peerUser.getUsername(), peerUser.getDisplayName(), peerUser.getAvatarUrl(), false)
        );
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, peerUser));
        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageReceiptRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatParticipantRepository.findByChatIdAndUserId(any(), any())).thenAnswer(invocation -> Optional.of(
                new ChatParticipant(UUID.randomUUID(), invocation.getArgument(0), invocation.getArgument(1), Instant.parse("2026-04-01T00:00:00Z"))
        ));
        when(messageReceiptRepository.findAllByMessageIdIn(anyList())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(anyList())).thenReturn(List.of());
        when(chatAttachmentRepository.findAllByMessageIdInOrderByCreatedAtAsc(anyList())).thenReturn(List.of());
        when(chatAttachmentRepository.findAllByMessageId(any())).thenReturn(List.of());
        when(userDeletedMessageRepository.existsByUserIdAndMessageId(any(), any())).thenReturn(false);
        when(userAccountRepository.findById(currentUser.getId())).thenReturn(Optional.of(currentUser));
        when(userAccountRepository.findAllByIdIn(anyList())).thenReturn(List.of(currentUser, peerUser));
        when(chatMessageRepository.findByChatIdAndSenderIdAndClientMessageId(any(), any(), anyString())).thenReturn(Optional.empty());
        when(messageContentCryptoService.encrypt(any(), any(), any(), anyString()))
                .thenReturn(new EncryptedMessageContent(new byte[]{1}, new byte[]{2}, 1, "AES_256_GCM"));
        when(messageContentCryptoService.requirePlainContent(any(ChatMessage.class))).thenAnswer(invocation -> {
            ChatMessage message = invocation.getArgument(0);
            return message.getContent();
        });
    }

    @Test
    void sendMessageShouldReturnSentStatusForAuthor() {
        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest("client-1", null, new PlainMessagePayloadRequest("hello"))
        );

        assertThat(response.plainPayload()).isNotNull();
        assertThat(response.plainPayload().content()).isEqualTo("hello");
        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        verify(messageDispatchOutboxService).enqueue(any(MessageDispatchEvent.class));
        verify(pendingOutgoingMessageService).deleteByUserIdAndClientMessageId(currentUser.getId(), "client-1");
    }

    @Test
    void sendMessageShouldReturnExistingDuplicateMessageAndPublishAckOnlyEvent() {
        ChatMessage existingMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                "hello",
                "client-1",
                null,
                Instant.parse("2026-04-02T10:00:00Z")
        );
        when(chatMessageRepository.findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), "client-1"))
                .thenReturn(Optional.of(existingMessage));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest("client-1", null, new PlainMessagePayloadRequest("hello"))
        );

        assertThat(response.plainPayload().content()).isEqualTo("hello");
        verify(messageDispatchOutboxService).enqueue(any(MessageDispatchEvent.class));
        verify(pendingOutgoingMessageService).deleteByUserIdAndClientMessageId(currentUser.getId(), "client-1");
    }

    @Test
    void sendMessageShouldRejectMissingPayload() {
        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest("client-1", null, null, null)
        ))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Message payload is incomplete");
    }

    @Test
    void updateMessageShouldReplaceContentWithPlainPayload() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                "before",
                "client-1",
                null,
                Instant.parse("2026-04-02T10:00:00Z")
        );
        when(chatMessageRepository.findById(message.getId())).thenReturn(Optional.of(message));

        MessageResponse response = messageService.updateMessage(
                chatId,
                message.getId(),
                "north",
                new UpdateMessageRequest(new PlainMessagePayloadRequest("after"))
        );

        assertThat(response.plainPayload().content()).isEqualTo("after");
        assertThat(message.getContent()).isEqualTo("after");
    }

    @Test
    void listMessagePageShouldReturnServerOwnedCursorAndConfirmedClientMessageIds() {
        ChatMessage later = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                "later",
                "client-2",
                null,
                Instant.parse("2026-04-02T10:01:00Z")
        ), 11L);
        ChatMessage earlier = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peerUser.getId(),
                "earlier",
                null,
                null,
                Instant.parse("2026-04-02T10:00:00Z")
        ), 10L);
        when(chatMessageRepository.findVisibleByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(later, earlier));

        MessagePageResponse response = messageService.listMessagePage(chatId, "north", null, 2, false);

        assertThat(response.messages()).extracting(message -> message.plainPayload().content())
                .containsExactly("earlier", "later");
        assertThat(response.nextCursor()).isEqualTo("10");
        assertThat(response.confirmedPendingOutgoingClientMessageIds()).containsExactly("client-2");
    }

    @Test
    void sendMessageShouldRejectReplyTargetOutsideVisibleHistoryWindow() {
        room = new ChatRoom(chatId, "group", false, Instant.parse("2026-04-01T00:00:00Z"));
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        room.updateGroupDetails("group", null, ChatPrejoinHistoryPolicy.JOIN_ONLY);
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                Instant.parse("2026-04-02T00:00:00Z")
        );
        ChatMessage oldMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                peerUser.getId(),
                "old message",
                Instant.parse("2026-04-01T10:00:00Z")
        );
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())).thenReturn(Optional.of(membership));
        when(chatMessageRepository.findById(oldMessage.getId())).thenReturn(Optional.of(oldMessage));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest("client-1", oldMessage.getId(), new PlainMessagePayloadRequest("reply"))
        ))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Reply target not found");
    }

    private static ChatMessage withServerOrder(ChatMessage message, long serverOrder) {
        try {
            var field = ChatMessage.class.getDeclaredField("serverOrder");
            field.setAccessible(true);
            field.set(message, serverOrder);
            return message;
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError(exception);
        }
    }
}
