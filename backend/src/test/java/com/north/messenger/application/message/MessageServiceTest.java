package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatMessageRepository chatMessageRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private MessageReactionRepository messageReactionRepository;
    private UserAccountRepository userAccountRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private ApplicationEventPublisher eventPublisher;
    private MessageDispatchOutboxService messageDispatchOutboxService;
    private MessengerTelemetry telemetry;
    private EntityManager entityManager;
    private ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private ChatAttachmentService chatAttachmentService;
    private PendingOutgoingMessageService pendingOutgoingMessageService;
    private MessageService messageService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        messageReactionRepository = mock(MessageReactionRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        messageDispatchOutboxService = mock(MessageDispatchOutboxService.class);
        telemetry = mock(MessengerTelemetry.class);
        entityManager = mock(EntityManager.class);
        chatGroupHistoryKeyService = mock(ChatGroupHistoryKeyService.class);
        chatAttachmentService = mock(ChatAttachmentService.class);
        pendingOutgoingMessageService = mock(PendingOutgoingMessageService.class);
        objectMapper = new ObjectMapper();

        MessageSupport messageSupport = new MessageSupport(
                authService,
                chatMessageRepository,
                messageReceiptRepository,
                messageReactionRepository,
                userAccountRepository,
                telemetry,
                objectMapper,
                mock(EncryptedMessagePreviewService.class)
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
                messageSupport
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
                chatGroupHistoryKeyService,
                chatAttachmentService,
                pendingOutgoingMessageService,
                entityManager
        );
        messageService = new MessageService(
                messageQueryService,
                messageCommandService,
                messageReactionService,
                messageReceiptService
        );

        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageReceiptRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatParticipantRepository.findByChatIdAndUserId(any(), any())).thenAnswer(invocation ->
                Optional.of(new ChatParticipant(
                        UUID.randomUUID(),
                        invocation.getArgument(0),
                        invocation.getArgument(1),
                        Instant.parse("2026-04-01T00:00:00Z")
                )));
    }

    @Test
    void sendMessageShouldReturnSentStatusForAuthor() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        String clientMessageId = clientMessageId();
        String sharedEnvelope = chatEpochSharedEnvelope(
                chatId,
                currentUser.getId(),
                clientMessageId,
                "chat-ciphertext",
                "iv-send"
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "CHAT-EPOCH-KEY-AES-GCM",
                                sharedEnvelope
                        )
                )
        );

        assertThat(response.sender().id()).isEqualTo(currentUser.getId());
        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().scheme()).isEqualTo("CHAT-EPOCH-KEY-AES-GCM");
        assertThat(response.encryptedPayload().sharedEnvelope()).isEqualTo(sharedEnvelope);
        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        assertThat(response.status().recipientCount()).isEqualTo(1);
        verify(chatService).restoreDeletedChatStateForUsers(eq(chatId), any());
    }

    @Test
    void acknowledgeReadShouldNotifySenderAboutReadStatus() {
        UUID chatId = UUID.randomUUID();
        UserAccount sender = user("north");
        UserAccount reader = user("alice");
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                "hello",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        MessageReceipt receipt = new MessageReceipt(
                UUID.randomUUID(),
                message.getId(),
                reader.getId(),
                null,
                null
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(reader);
        when(messageReceiptRepository.findAllByUserIdAndChatIdAndMessageIdIn(
                reader.getId(),
                chatId,
                List.of(message.getId())
        )).thenReturn(List.of(receipt));
        when(chatMessageRepository.findAllById(List.of(message.getId()))).thenReturn(List.of(message));
        when(messageReceiptRepository.findAllByMessageIdIn(List.of(message.getId()))).thenReturn(List.of(receipt));
        when(userAccountRepository.findAllByIdIn(List.of(sender.getId()))).thenReturn(List.of(sender));

        messageService.acknowledgeRead(chatId, "alice", new MessageReceiptRequest(List.of(message.getId())));

        ArgumentCaptor<MessageStatusChangedEvent> eventCaptor = ArgumentCaptor.forClass(MessageStatusChangedEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue().chatId()).isEqualTo(chatId);
        assertThat(eventCaptor.getValue().messageIds()).containsExactly(message.getId());
        assertThat(eventCaptor.getValue().refreshChatSummary()).isTrue();
    }

    @Test
    void toggleReactionShouldPublishDeferredReactionEvent() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"));
        ChatMessage message = new ChatMessage(
                messageId,
                chatId,
                currentUser.getId(),
                "ciphertext-value",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        MessageReaction savedReaction = new MessageReaction(
                UUID.randomUUID(),
                messageId,
                currentUser.getId(),
                "LIKE",
                Instant.parse("2026-03-24T12:01:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findById(messageId)).thenReturn(Optional.of(message));
        when(messageReactionRepository.findByMessageIdAndUserIdAndReactionKey(messageId, currentUser.getId(), "LIKE"))
                .thenReturn(Optional.empty());
        when(messageReactionRepository.save(any(MessageReaction.class))).thenReturn(savedReaction);
        when(messageReactionRepository.findAllByMessageIdIn(List.of(messageId))).thenReturn(List.of(savedReaction));

        messageService.toggleReaction(chatId, messageId, "north", new ToggleMessageReactionRequest("LIKE"));

        ArgumentCaptor<MessageReactionChangedEvent> eventCaptor =
                ArgumentCaptor.forClass(MessageReactionChangedEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isEqualTo(new MessageReactionChangedEvent(chatId, messageId));
    }

    @Test
    void sendMessageShouldStoreEncryptedPayloadWithoutPlaintext() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        String clientMessageId = clientMessageId();
        String sharedEnvelope = chatEpochSharedEnvelope(
                chatId,
                currentUser.getId(),
                clientMessageId,
                "chat-ciphertext",
                "iv-store"
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "CHAT-EPOCH-KEY-AES-GCM",
                                sharedEnvelope
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().sharedEnvelope()).isEqualTo(sharedEnvelope);
        verify(chatMessageRepository).saveAndFlush(argThat((ChatMessage message) ->
                "CHAT-EPOCH-KEY-AES-GCM".equals(message.getEncryptionScheme())
                        && sharedEnvelope.equals(message.getContent())
        ));
    }

    @Test
    void sendMessageShouldNotPersistRecipientPayloadRowsForChatEpochPayload() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        String clientMessageId = clientMessageId();
        String sharedEnvelope = chatEpochSharedEnvelope(
                chatId,
                currentUser.getId(),
                clientMessageId,
                "chat-ciphertext",
                "iv-normalized"
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "CHAT-EPOCH-KEY-AES-GCM",
                                sharedEnvelope
                        )
                )
        );

        verify(chatMessageRepository).saveAndFlush(argThat((ChatMessage message) ->
                "CHAT-EPOCH-KEY-AES-GCM".equals(message.getEncryptionScheme())
        ));
    }

    @Test
    void sendMessageShouldRefreshManagedEntityReturnedByRepository() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        String clientMessageId = clientMessageId();
        String sharedEnvelope = chatEpochSharedEnvelope(
                chatId,
                currentUser.getId(),
                clientMessageId,
                "chat-ciphertext",
                "iv-refresh"
        );
        AtomicReference<ChatMessage> detachedMessage = new AtomicReference<>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class))).thenAnswer(invocation -> {
            ChatMessage original = invocation.getArgument(0);
            detachedMessage.set(original);
            return withServerOrder(new ChatMessage(
                    original.getId(),
                    original.getChatId(),
                    original.getSenderId(),
                    original.getContent(),
                    original.getEncryptionScheme(),
                    original.getEncryptionIv(),
                    original.getHistoryKeyId(),
                    original.getClientMessageId(),
                    original.getReplyToMessageId(),
                    original.getCreatedAt()
            ), 42L);
        });
        org.mockito.Mockito.doAnswer(invocation -> {
            ChatMessage refreshedMessage = invocation.getArgument(0);
            if (refreshedMessage == detachedMessage.get()) {
                throw new IllegalArgumentException("Entity not managed");
            }
            return null;
        }).when(entityManager).refresh(any(ChatMessage.class));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "CHAT-EPOCH-KEY-AES-GCM",
                                sharedEnvelope
                        )
                )
        );

        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        assertThat(response.serverOrder()).isEqualTo(42L);
        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().sharedEnvelope()).isEqualTo(sharedEnvelope);
        verify(entityManager).refresh(argThat(message -> message != detachedMessage.get()));
    }

    @Test
    void sendMessageShouldReturnExistingDuplicateMessageAndPublishAckOnlyEvent() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        String duplicateClientMessageId = clientMessageId();
        String existingSharedEnvelope = chatEpochSharedEnvelope(
                chatId,
                currentUser.getId(),
                duplicateClientMessageId,
                "ciphertext-existing",
                "iv-existing"
        );
        ChatMessage existingMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                existingSharedEnvelope,
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-existing",
                UUID.randomUUID(),
                duplicateClientMessageId,
                null,
                Instant.parse("2026-03-24T12:00:00Z")
        ), 77L);
        MessageReceipt existingReceipt = new MessageReceipt(
                UUID.randomUUID(),
                existingMessage.getId(),
                recipient.getId(),
                null,
                null
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate client message id"));
        when(chatMessageRepository.findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), duplicateClientMessageId))
                .thenReturn(Optional.empty(), Optional.of(existingMessage), Optional.of(existingMessage));
        when(messageReceiptRepository.findAllByMessageIdIn(List.of(existingMessage.getId())))
                .thenReturn(List.of(existingReceipt));
        when(messageReactionRepository.findAllByMessageIdIn(List.of(existingMessage.getId())))
                .thenReturn(List.of());

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        duplicateClientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "CHAT-EPOCH-KEY-AES-GCM",
                                chatEpochSharedEnvelope(
                                        chatId,
                                        currentUser.getId(),
                                        duplicateClientMessageId,
                                        "ciphertext-new",
                                        "iv-new"
                                )
                        )
                )
        );

        ArgumentCaptor<MessageDispatchEvent> eventCaptor = ArgumentCaptor.forClass(MessageDispatchEvent.class);
        verify(messageDispatchOutboxService).enqueue(eventCaptor.capture());
        verify(chatMessageRepository).saveAndFlush(any(ChatMessage.class));
        assertThat(response.id()).isEqualTo(existingMessage.getId());
        assertThat(response.clientMessageId()).isEqualTo(duplicateClientMessageId);
        assertThat(response.serverOrder()).isEqualTo(77L);
        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().scheme()).isEqualTo("CHAT-EPOCH-KEY-AES-GCM");
        assertThat(response.encryptedPayload().sharedEnvelope()).isEqualTo(existingSharedEnvelope);
        assertThat(eventCaptor.getValue()).isEqualTo(new MessageDispatchEvent(
                chatId,
                existingMessage.getId(),
                duplicateClientMessageId,
                MessageDispatchMode.ACK_ONLY
        ));
    }

    @Test
    void sendMessageShouldRejectMissingEncryptedPayload() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(clientMessageId(), null, null)
        ))
                .hasMessageContaining("End-to-end encrypted payload is required");
    }

    @Test
    void sendMessageShouldRejectLegacyEncryptedSchemeForDirectChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "UNSUPPORTED-SCHEME",
                                null
                        )
                )
        )).hasMessageContaining("Only chat epoch encrypted payloads are supported");
    }

    @Test
    void sendMessageShouldRejectLegacyEncryptedSchemeForGroupChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "UNSUPPORTED-SCHEME",
                                null
                        )
                )
        )).hasMessageContaining("Only chat epoch encrypted payloads are supported");
    }

    @Test
    void listMessagesShouldRejectMalformedEncryptedMessages() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        ChatMessage malformedMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                "",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-malformed",
                UUID.randomUUID(),
                null,
                null,
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);
        ChatMessage validMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                chatEpochSharedEnvelope(chatId, sender.getId(), "ciphertext-valid", "iv-valid"),
                "CHAT-EPOCH-KEY-AES-GCM",
                base64Fixed("iv-valid", 12),
                UUID.randomUUID(),
                null,
                null,
                Instant.parse("2026-03-24T12:01:00Z")
        ), 20L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(validMessage, malformedMessage));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReceiptRepository.findAllByUserIdAndChatIdAndMessageIdIn(eq(currentUser.getId()), eq(chatId), any()))
                .thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));
        assertThatThrownBy(() -> messageService.listMessages(chatId, "alice", null, 50, true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Encrypted chat epoch envelope is missing");
    }

    @Test
    void listMessagesShouldOrderByServerOrder() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        Instant createdAt = Instant.parse("2026-03-24T12:00:00Z");
        ChatMessage higherOrderMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000b0"),
                chatId,
                sender.getId(),
                chatEpochSharedEnvelope(chatId, sender.getId(), "ciphertext-b", "iv-b"),
                "CHAT-EPOCH-KEY-AES-GCM",
                base64Fixed("iv-b", 12),
                UUID.randomUUID(),
                null,
                null,
                createdAt
        ), 20L);
        ChatMessage lowerOrderMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a0"),
                chatId,
                sender.getId(),
                chatEpochSharedEnvelope(chatId, sender.getId(), "ciphertext-a", "iv-a"),
                "CHAT-EPOCH-KEY-AES-GCM",
                base64Fixed("iv-a", 12),
                UUID.randomUUID(),
                null,
                null,
                createdAt
        ), 10L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(higherOrderMessage, lowerOrderMessage));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).extracting(MessageResponse::id)
                .containsExactly(lowerOrderMessage.getId(), higherOrderMessage.getId());
        verify(messageReceiptRepository, never()).findAllByUserIdAndChatIdAndMessageIdIn(
                eq(currentUser.getId()),
                eq(chatId),
                any()
        );
    }

    @Test
    void listMessagesShouldReturnChatEpochMessagesWithoutLoadingVisibleDevices() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        ChatMessage firstMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a1"),
                chatId,
                sender.getId(),
                "chat-epoch-envelope-a",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-a",
                UUID.randomUUID(),
                null,
                null,
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);
        ChatMessage secondMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a2"),
                chatId,
                sender.getId(),
                "chat-epoch-envelope-b",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-b",
                UUID.randomUUID(),
                null,
                null,
                Instant.parse("2026-03-24T12:00:01Z")
        ), 20L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(secondMessage, firstMessage));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).extracting(MessageResponse::id)
                .containsExactly(firstMessage.getId(), secondMessage.getId());
        assertThat(response)
                .extracting(message -> message.encryptedPayload().sharedEnvelope())
                .containsExactly("chat-epoch-envelope-a", "chat-epoch-envelope-b");
    }

    @Test
    void listMessagesShouldReturnChatEpochPayloadWithoutRecipientRows() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatMessage message = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000d3"),
                chatId,
                currentUser.getId(),
                "chat-epoch-envelope-own",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-own-historical",
                UUID.randomUUID(),
                null,
                null,
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(message));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(currentUser));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        List<MessageResponse> response = messageService.listMessages(chatId, "north", null, 50, false);

        assertThat(response).hasSize(1);
        assertThat(response.get(0).encryptedPayload()).isNotNull();
        assertThat(response.get(0).encryptedPayload().sharedEnvelope()).isEqualTo("chat-epoch-envelope-own");
    }

    @Test
    void listMessagesShouldUseServerOrderCursorForPagination() {
        UUID chatId = UUID.randomUUID();
        long beforeServerOrder = 100L;
        UserAccount currentUser = user("alice");

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
                eq(chatId),
                eq(beforeServerOrder),
                eq(currentUser.getId()),
                org.mockito.ArgumentMatchers.any(org.springframework.data.domain.Pageable.class)
        )).thenReturn(List.of());

        List<MessageResponse> response = messageService.listMessages(
                chatId,
                "alice",
                beforeServerOrder,
                50,
                false
        );

        assertThat(response).isEmpty();
        verify(chatMessageRepository).findVisibleEncryptedByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
                eq(chatId),
                eq(beforeServerOrder),
                eq(currentUser.getId()),
                org.mockito.ArgumentMatchers.any(org.springframework.data.domain.Pageable.class)
        );
        verify(chatMessageRepository, never()).findVisibleEncryptedByChatIdOrderByServerOrderDesc(
                any(),
                any(),
                org.mockito.ArgumentMatchers.any(org.springframework.data.domain.Pageable.class)
        );
    }

    @Test
    void listMessagePageShouldReturnServerOwnedCursorAndConfirmedClientMessageIds() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatMessage olderMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000f1"),
                chatId,
                currentUser.getId(),
                "chat-epoch-envelope-own-older",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-own-older",
                UUID.randomUUID(),
                "client-message-1",
                null,
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);
        ChatMessage newerMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000f2"),
                chatId,
                currentUser.getId(),
                "chat-epoch-envelope-own-newer",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv-own-newer",
                UUID.randomUUID(),
                "client-message-2",
                null,
                Instant.parse("2026-03-24T12:00:01Z")
        ), 20L);

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(newerMessage, olderMessage));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(currentUser));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        MessagePageResponse response = messageService.listMessagePage(
                chatId,
                "north",
                null,
                2,
                false
        );

        assertThat(response.nextCursor()).isEqualTo("10");
        assertThat(response.confirmedPendingOutgoingClientMessageIds())
                .containsExactly("client-message-1", "client-message-2");
        assertThat(response.messages()).extracting(MessageResponse::id)
                .containsExactly(olderMessage.getId(), newerMessage.getId());
    }

    @Test
    void deleteMessageShouldNotifyAllParticipants() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"));
        ChatMessage message = new ChatMessage(
                messageId,
                chatId,
                currentUser.getId(),
                "ciphertext-value",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findAllById(List.of(messageId))).thenReturn(List.of(message));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        messageService.deleteMessage(chatId, messageId, "north", "EVERYONE");

        ArgumentCaptor<MessageDeletionBroadcastEvent> eventCaptor = ArgumentCaptor.forClass(MessageDeletionBroadcastEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        verify(chatMessageRepository).deleteAll(List.of(message));
        assertThat(eventCaptor.getValue().chatId()).isEqualTo(chatId);
        assertThat(eventCaptor.getValue().messageId()).isEqualTo(messageId);
        assertThat(eventCaptor.getValue().usernames()).containsExactly("north", "alice");
    }

    @Test
    void deleteMessageShouldRejectDeletingOtherUsersDirectMessageForEveryone() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"));
        ChatMessage message = new ChatMessage(
                messageId,
                chatId,
                recipient.getId(),
                "ciphertext-value",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findAllById(List.of(messageId))).thenReturn(List.of(message));

        assertThatThrownBy(() -> messageService.deleteMessage(chatId, messageId, "north", "EVERYONE"))
                .hasMessageContaining("only available for your own messages");

        verify(chatMessageRepository, never()).delete(any(ChatMessage.class));
    }

    @Test
    void deleteMessagesShouldDeleteAllSelectedMessagesForEveryoneInOneOperation() {
        UUID chatId = UUID.randomUUID();
        UUID firstMessageId = UUID.randomUUID();
        UUID secondMessageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"));
        room.pinMessage(firstMessageId, Instant.parse("2026-03-24T11:30:00Z"));
        ChatMessage firstMessage = new ChatMessage(
                firstMessageId,
                chatId,
                currentUser.getId(),
                "ciphertext-1",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        ChatMessage secondMessage = new ChatMessage(
                secondMessageId,
                chatId,
                currentUser.getId(),
                "ciphertext-2",
                Instant.parse("2026-03-24T12:01:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findAllById(List.of(firstMessageId, secondMessageId)))
                .thenReturn(List.of(firstMessage, secondMessage));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        messageService.deleteMessages(chatId, List.of(firstMessageId, secondMessageId), "north", "EVERYONE");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ChatMessage>> deletedMessagesCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<MessageDeletionBroadcastEvent> eventCaptor =
                ArgumentCaptor.forClass(MessageDeletionBroadcastEvent.class);
        verify(chatAttachmentService).deleteAttachmentsForMessage(firstMessageId);
        verify(chatAttachmentService).deleteAttachmentsForMessage(secondMessageId);
        verify(chatMessageRepository).deleteAll(deletedMessagesCaptor.capture());
        verify(chatMessageRepository, never()).delete(any(ChatMessage.class));
        verify(eventPublisher, times(2)).publishEvent(eventCaptor.capture());
        assertThat(deletedMessagesCaptor.getValue())
                .extracting(ChatMessage::getId)
                .containsExactly(firstMessageId, secondMessageId);
        assertThat(room.getPinnedMessageId()).isNull();
        assertThat(eventCaptor.getAllValues())
                .extracting(MessageDeletionBroadcastEvent::messageId)
                .containsExactly(firstMessageId, secondMessageId);
        assertThat(eventCaptor.getAllValues())
                .extracting(MessageDeletionBroadcastEvent::usernames)
                .allSatisfy(usernames -> assertThat(usernames).containsExactly("north", "alice"));
    }

    @Test
    void deleteMessagesShouldCreateOnlyMissingSelfDeletionMarkers() {
        UUID chatId = UUID.randomUUID();
        UUID firstMessageId = UUID.randomUUID();
        UUID secondMessageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"));
        ChatMessage firstMessage = new ChatMessage(
                firstMessageId,
                chatId,
                currentUser.getId(),
                "ciphertext-1",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        ChatMessage secondMessage = new ChatMessage(
                secondMessageId,
                chatId,
                currentUser.getId(),
                "ciphertext-2",
                Instant.parse("2026-03-24T12:01:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findAllById(List.of(firstMessageId, secondMessageId)))
                .thenReturn(List.of(firstMessage, secondMessage));
        when(userDeletedMessageRepository.findAllByUserIdAndMessageIdIn(
                currentUser.getId(),
                List.of(firstMessageId, secondMessageId)
        )).thenReturn(List.of(
                new UserDeletedMessage(UUID.randomUUID(), currentUser.getId(), firstMessageId, Instant.now())
        ));

        messageService.deleteMessages(chatId, List.of(firstMessageId, secondMessageId), "north", "SELF");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UserDeletedMessage>> tombstonesCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<MessageDeletionBroadcastEvent> eventCaptor =
                ArgumentCaptor.forClass(MessageDeletionBroadcastEvent.class);
        verify(userDeletedMessageRepository).saveAll(tombstonesCaptor.capture());
        verify(eventPublisher, times(2)).publishEvent(eventCaptor.capture());
        verify(chatMessageRepository, never()).deleteAll(any());
        assertThat(tombstonesCaptor.getValue())
                .extracting(UserDeletedMessage::getMessageId)
                .containsExactly(secondMessageId);
        assertThat(eventCaptor.getAllValues())
                .extracting(MessageDeletionBroadcastEvent::messageId)
                .containsExactly(firstMessageId, secondMessageId);
        assertThat(eventCaptor.getAllValues())
                .extracting(MessageDeletionBroadcastEvent::usernames)
                .allSatisfy(usernames -> assertThat(usernames).containsExactly("north"));
    }

    @Test
    void deleteMessagesShouldRejectDeleteForSelfInGroupChats() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        ChatRoom room = new ChatRoom(chatId, "Group", false, Instant.parse("2026-03-24T11:00:00Z"));
        ChatMessage message = new ChatMessage(
                messageId,
                chatId,
                currentUser.getId(),
                "ciphertext-1",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(room);
        when(chatMessageRepository.findAllById(List.of(messageId))).thenReturn(List.of(message));

        assertThatThrownBy(() -> messageService.deleteMessages(chatId, List.of(messageId), "north", "SELF"))
                .hasMessageContaining("Delete for self is not available in group chats");

        verify(userDeletedMessageRepository, never()).saveAll(any());
        verify(chatMessageRepository, never()).deleteAll(any());
    }

    private UserAccount user(String username) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                username.toUpperCase(),
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
    }

    private ParticipantResponse participant(UserAccount user) {
        return new ParticipantResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                true
        );
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

    private String clientMessageId() {
        return "client-" + UUID.randomUUID();
    }

    private String chatEpochSharedEnvelope(UUID chatId, UUID senderUserId, String ciphertext, String iv) {
        return chatEpochSharedEnvelope(chatId, senderUserId, UUID.randomUUID().toString(), ciphertext, iv);
    }

    private String chatEpochSharedEnvelope(
            UUID chatId,
            UUID senderUserId,
            String messageRefId,
            String ciphertext,
            String iv
    ) {
        return """
                {"aadVersion":1,"context":"north.chat-message.v1","chatId":"%s","senderUserId":"%s","historyKeyId":"%s","membershipVersion":0,"messageRefId":"%s","createdAt":"2026-03-24T12:00:00Z","contentType":"text/plain","ciphertext":"%s","iv":"%s"}
                """.formatted(
                        chatId,
                        senderUserId,
                        UUID.randomUUID(),
                        messageRefId,
                        base64(ciphertext),
                        base64Fixed(iv, 12)
                )
                .replace("\n", "")
                .trim();
    }

    private String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String base64Fixed(String value, int length) {
        byte[] bytes = new byte[length];
        byte[] source = value.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < bytes.length; index += 1) {
            bytes[index] = source[index % source.length];
        }
        return Base64.getEncoder().encodeToString(bytes);
    }

}





