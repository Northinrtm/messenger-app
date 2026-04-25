package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import com.north.messenger.application.e2ee.DeviceKeyValidationService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatMessageRecipientPayload;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ChatGroupSenderKeyCounter;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionEnvelopeCounter;
import com.north.messenger.domain.model.UserEncryptionOneTimePrekey;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.repository.ChatGroupSenderKeyCounterRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatMessageRecipientPayloadRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionEnvelopeCounterRepository;
import com.north.messenger.domain.repository.UserEncryptionOneTimePrekeyRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private ChatMessageRecipientPayloadRepository chatMessageRecipientPayloadRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private MessageReactionRepository messageReactionRepository;
    private UserAccountRepository userAccountRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository;
    private UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository;
    private UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private ChatGroupSenderKeyCounterRepository chatGroupSenderKeyCounterRepository;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private ApplicationEventPublisher eventPublisher;
    private MessageDispatchOutboxService messageDispatchOutboxService;
    private MessengerTelemetry telemetry;
    private EntityManager entityManager;
    private ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private ChatAttachmentService chatAttachmentService;
    private MessageService messageService;
    private ObjectMapper objectMapper;
    private Map<UUID, KeyPair> deviceSignatureKeyPairs;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        chatMessageRecipientPayloadRepository = mock(ChatMessageRecipientPayloadRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        messageReactionRepository = mock(MessageReactionRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        userEncryptionDeviceRepository = mock(UserEncryptionDeviceRepository.class);
        userEncryptionEnvelopeCounterRepository = mock(UserEncryptionEnvelopeCounterRepository.class);
        userEncryptionOneTimePrekeyRepository = mock(UserEncryptionOneTimePrekeyRepository.class);
        userEncryptionSignedPrekeyRepository = mock(UserEncryptionSignedPrekeyRepository.class);
        chatGroupSenderKeyCounterRepository = mock(ChatGroupSenderKeyCounterRepository.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        messageDispatchOutboxService = mock(MessageDispatchOutboxService.class);
        telemetry = mock(MessengerTelemetry.class);
        entityManager = mock(EntityManager.class);
        chatGroupHistoryKeyService = mock(ChatGroupHistoryKeyService.class);
        chatAttachmentService = mock(ChatAttachmentService.class);
        objectMapper = new ObjectMapper();
        deviceSignatureKeyPairs = new HashMap<>();
        DeviceKeyValidationService deviceKeyValidationService = new DeviceKeyValidationService(objectMapper);

        MessageSupport messageSupport = new MessageSupport(
                authService,
                chatMessageRepository,
                chatMessageRecipientPayloadRepository,
                messageReceiptRepository,
                messageReactionRepository,
                userAccountRepository,
                userEncryptionDeviceRepository,
                userEncryptionEnvelopeCounterRepository,
                userEncryptionOneTimePrekeyRepository,
                userEncryptionSignedPrekeyRepository,
                chatGroupSenderKeyCounterRepository,
                deviceKeyValidationService,
                telemetry,
                objectMapper
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
                entityManager
        );
        messageService = new MessageService(
                messageQueryService,
                messageCommandService,
                messageReactionService,
                messageReceiptService
        );

        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatMessageRecipientPayloadRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatMessageRecipientPayloadRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(chatMessageRecipientPayloadRepository.findAllByMessageIdInAndRecipientUserId(any(), any()))
                .thenReturn(List.of());
        when(messageReceiptRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(userEncryptionEnvelopeCounterRepository.insertIfAbsent(any(), any(), any(), any(), any(), anyInt(), any(Instant.class)))
                .thenReturn(1);
        when(userEncryptionEnvelopeCounterRepository.save(any(UserEncryptionEnvelopeCounter.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(userEncryptionSignedPrekeyRepository.findActiveByDeviceIdAndKeyId(any(UUID.class), anyInt(), any(Instant.class)))
                .thenAnswer(invocation -> {
                    UUID deviceId = invocation.getArgument(0);
                    int keyId = invocation.getArgument(1);
                    if (keyId != 7) {
                        return Optional.empty();
                    }
                    return Optional.of(new UserEncryptionSignedPrekey(
                            UUID.randomUUID(),
                            deviceId,
                            keyId,
                            x25519PublicJwk("signed-" + deviceId),
                            "signature",
                            "X25519",
                            Instant.parse("2026-03-24T11:00:00Z"),
                            null,
                            null
                    ));
                });
        when(chatGroupSenderKeyCounterRepository.findByChatIdAndSenderDeviceIdAndSenderKeyId(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(chatGroupSenderKeyCounterRepository.save(any(ChatGroupSenderKeyCounter.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(any(), anyInt()))
                .thenReturn(Optional.empty());
        when(userEncryptionOneTimePrekeyRepository.save(any(UserEncryptionOneTimePrekey.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void sendMessageShouldReturnSentStatusForAuthor() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        );

        assertThat(response.sender().id()).isEqualTo(currentUser.getId());
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
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().encryptedKeysByRecipientId())
                .containsEntry(currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"));
    }

    @Test
    void sendMessageShouldPersistRecipientPayloadRowsInNormalizedTable() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        String selfEnvelope = deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self");
        String recipientEnvelope = deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer");

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), selfEnvelope,
                                        recipientDevice.getId().toString(), recipientEnvelope
                                )
                        )
                )
        );

        verify(chatMessageRepository).saveAndFlush(argThat((ChatMessage message) ->
                message.getEncryptedKeysJson() == null
        ));
        verify(chatMessageRecipientPayloadRepository).saveAll(argThat(
                (List<ChatMessageRecipientPayload> payloads) -> payloads.size() == 2
                        && payloads.stream().anyMatch(payload ->
                        payload.getRecipientUserId().equals(currentUser.getId())
                                && payload.getRecipientDeviceId().equals(currentDevice.getId())
                                && payload.getEncryptedPayload().equals(selfEnvelope))
                        && payloads.stream().anyMatch(payload ->
                        payload.getRecipientUserId().equals(recipient.getId())
                                && payload.getRecipientDeviceId().equals(recipientDevice.getId())
                                && payload.getEncryptedPayload().equals(recipientEnvelope))
        ));
    }

    @Test
    void sendMessageShouldRefreshManagedEntityReturnedByRepository() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        AtomicReference<ChatMessage> detachedMessage = new AtomicReference<>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
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
                    original.getEncryptedKeysJson(),
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
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        );

        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        assertThat(response.serverOrder()).isEqualTo(42L);
        verify(entityManager).refresh(argThat(message -> message != detachedMessage.get()));
    }

    @Test
    void sendMessageShouldReturnExistingDuplicateMessageAndPublishAckOnlyEvent() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        String duplicateClientMessageId = clientMessageId();
        ChatMessage existingMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                "ciphertext-existing",
                "X3DH-DEVICE-AES-GCM",
                "iv-existing",
                objectMapper.writeValueAsString(Map.of(
                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self-existing", "iv-self-existing"),
                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer-existing", "iv-peer-existing")
                )),
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
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        when(chatMessageRepository.saveAndFlush(any(ChatMessage.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate client message id"));
        when(chatMessageRepository.findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), duplicateClientMessageId))
                .thenReturn(Optional.empty(), Optional.of(existingMessage), Optional.of(existingMessage));
        when(messageReceiptRepository.findAllByMessageIdIn(List.of(existingMessage.getId())))
                .thenReturn(List.of(existingReceipt));
        when(messageReactionRepository.findAllByMessageIdIn(List.of(existingMessage.getId())))
                .thenReturn(List.of());
        when(chatMessageRecipientPayloadRepository.findAllByMessageIdIn(
                argThat(messageIds -> messageIds != null
                        && messageIds.size() == 1
                        && messageIds.contains(existingMessage.getId()))
        )).thenReturn(List.of(
                new ChatMessageRecipientPayload(
                        existingMessage.getId(),
                        currentDevice.getId(),
                        currentUser.getId(),
                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self-existing", "iv-self-existing"),
                        existingMessage.getCreatedAt()
                ),
                new ChatMessageRecipientPayload(
                        existingMessage.getId(),
                        recipientDevice.getId(),
                        recipient.getId(),
                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer-existing", "iv-peer-existing"),
                        existingMessage.getCreatedAt()
                )
        ));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        duplicateClientMessageId,
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self-new", "iv-self-new"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer-new", "iv-peer-new")
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
                                "RSA-OAEP-256/AES-GCM",
                                Map.of(
                                        currentUser.getId().toString(), "sender-wrapped-key",
                                        recipient.getId().toString(), "recipient-wrapped-key"
                                )
                        )
                )
        )).hasMessageContaining("Direct chats must use current device transport");
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
                                "RSA-OAEP-256/AES-GCM",
                                Map.of(
                                        currentUser.getId().toString(), "sender-wrapped-key",
                                        recipient.getId().toString(), "recipient-wrapped-key"
                                )
                        )
                )
        )).hasMessageContaining("Group chats must use current shared device transport");
    }

    @Test
    void sendMessageShouldAcceptCurrentDeviceTransportForDirectChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().scheme()).isEqualTo("X3DH-DEVICE-AES-GCM");
        assertThat(response.encryptedPayload().encryptedKeysByRecipientId())
                .containsOnlyKeys(currentDevice.getId().toString());
    }

    @Test
    void sendMessageShouldAcceptCurrentSharedDeviceTransportForGroupChat() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        String sharedEnvelope = groupSharedEnvelope(
                chatId,
                currentUser,
                currentDevice,
                "group-ciphertext",
                "group-iv"
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "GROUP-SENDER-KEY-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                ),
                                sharedEnvelope
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().scheme()).isEqualTo("GROUP-SENDER-KEY-AES-GCM");
        assertThat(response.encryptedPayload().sharedEnvelope()).isEqualTo(sharedEnvelope);
        assertThat(response.encryptedPayload().encryptedKeysByRecipientId())
                .containsOnlyKeys(currentDevice.getId().toString());
    }

    @Test
    void sendMessageShouldRejectPayloadThatOmitsAnActiveParticipantDevice() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        UserEncryptionDevice recipientSecondDevice = device(recipient, UUID.randomUUID(), "recipient-device-2");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice, recipientSecondDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted payload must include every active participant device");
    }

    @Test
    void sendMessageShouldRejectGroupPayloadWithInvalidSignature() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, "Group", false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "GROUP-SENDER-KEY-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                ),
                                groupSharedEnvelope(chatId, currentUser, currentDevice, "group-ciphertext", "group-iv")
                                        .replace("\"signature\":\"", "\"signature\":\"AQID")
                        )
                )
        )).hasMessageContaining("Encrypted group envelope signature is invalid");
    }

    @Test
    void sendMessageShouldRejectGroupPayloadWithStaleMessageCounter() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, "Group", false, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(chatGroupSenderKeyCounterRepository.findByChatIdAndSenderDeviceIdAndSenderKeyId(
                chatId,
                currentDevice.getId(),
                "sender-key-" + currentDevice.getId()
        )).thenReturn(Optional.of(new ChatGroupSenderKeyCounter(
                UUID.randomUUID(),
                chatId,
                currentDevice.getId(),
                "sender-key-" + currentDevice.getId(),
                1,
                Instant.parse("2026-03-24T11:59:00Z")
        )));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "GROUP-SENDER-KEY-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                ),
                                groupSharedEnvelope(chatId, currentUser, currentDevice, "group-ciphertext", "group-iv")
                        )
                )
        )).hasMessageContaining("Encrypted group envelope message counter is stale");
    }

    @Test
    void sendMessageShouldRejectDeviceEnvelopeWithoutAadVersion() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), "{\"ciphertext\":\"self\",\"iv\":\"iv-self\"}",
                                        recipientDevice.getId().toString(), "{\"ciphertext\":\"peer\",\"iv\":\"iv-peer\"}"
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope must use current authenticated format");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithInvalidSenderDevice() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, recipientDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope sender device is invalid");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithMalformedRatchetKey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace(
                                                        jsonEscape(deviceRatchetPublicKey(recipientDevice)),
                                                        "not-a-jwk"
                                                )
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope ratchet key is malformed");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithInvalidIvEncoding() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace(base64Fixed("iv-peer", 12), "%%%")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope is malformed");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithStaleRecipientSignedPrekey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientSignedPrekeyId\":7", "\"recipientSignedPrekeyId\":99")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope recipient prekey is stale");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithMismatchedRecipientDeviceId() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace(
                                                        "\"recipientDeviceId\":\"" + recipientDevice.getId() + "\"",
                                                        "\"recipientDeviceId\":\"" + currentDevice.getId() + "\""
                                                )
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope recipient device is invalid");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithNonBootstrapOneTimePrekey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return Optional.of(new UserEncryptionEnvelopeCounter(
                                UUID.randomUUID(),
                                currentDevice.getId(),
                                recipientDevice.getId(),
                                deviceRatchetPublicKey(recipientDevice),
                                deviceInitiatorEphemeralPublicKey(recipientDevice),
                                0,
                                Instant.parse("2026-03-24T11:59:00Z")
                        ));
                    }
                    return Optional.empty();
                });
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(recipientDevice.getId(), 21))
                .thenReturn(Optional.of(oneTimePrekey(
                        recipientDevice,
                        21,
                        Instant.parse("2026-03-24T11:50:00Z"),
                        currentDevice.getId(),
                        null,
                        null,
                        null
                )));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientOneTimePrekeyId\":null", "\"recipientOneTimePrekeyId\":21")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":1")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope one-time prekey is only allowed on bootstrap");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithInvalidRecipientOneTimePrekey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(recipientDevice.getId(), 21))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientOneTimePrekeyId\":null", "\"recipientOneTimePrekeyId\":21")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope recipient one-time prekey is invalid");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithRecipientOneTimePrekeyBoundToAnotherSenderDevice() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice otherCurrentDevice = device(currentUser, UUID.randomUUID(), "other-current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, otherCurrentDevice, recipientDevice));
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(recipientDevice.getId(), 21))
                .thenReturn(Optional.of(oneTimePrekey(
                        recipientDevice,
                        21,
                        Instant.parse("2026-03-24T11:50:00Z"),
                        otherCurrentDevice.getId(),
                        null,
                        null,
                        null
                )));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientOneTimePrekeyId\":null", "\"recipientOneTimePrekeyId\":21")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope recipient one-time prekey sender is invalid");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWhenRecipientOneTimePrekeyWasAlreadyAcceptedForAnotherChain() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(recipientDevice.getId(), 21))
                .thenReturn(Optional.of(oneTimePrekey(
                        recipientDevice,
                        21,
                        Instant.parse("2026-03-24T11:50:00Z"),
                        currentDevice.getId(),
                        Instant.parse("2026-03-24T11:51:00Z"),
                        deviceInitiatorEphemeralPublicKey(recipientDevice),
                        x25519PublicJwk("accepted-ratchet")
                )));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientOneTimePrekeyId\":null", "\"recipientOneTimePrekeyId\":21")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope recipient one-time prekey was already used");
    }

    @Test
    void sendMessageShouldPersistAcceptedBootstrapChainForRecipientOneTimePrekey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        UserEncryptionOneTimePrekey oneTimePrekey = oneTimePrekey(
                recipientDevice,
                21,
                Instant.parse("2026-03-24T11:50:00Z"),
                currentDevice.getId(),
                null,
                null,
                null
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        when(userEncryptionOneTimePrekeyRepository.findByDeviceIdAndKeyId(recipientDevice.getId(), 21))
                .thenReturn(Optional.of(oneTimePrekey));

        messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"recipientOneTimePrekeyId\":null", "\"recipientOneTimePrekeyId\":21")
                                )
                        )
                )
        );

        assertThat(oneTimePrekey.getAcceptedAt()).isNotNull();
        assertThat(oneTimePrekey.getAcceptedInitiatorEphemeralPublicKey())
                .isEqualTo(deviceInitiatorEphemeralPublicKey(recipientDevice));
        assertThat(oneTimePrekey.getAcceptedRatchetPublicKey())
                .isEqualTo(deviceRatchetPublicKey(recipientDevice));
        verify(userEncryptionOneTimePrekeyRepository).save(oneTimePrekey);
    }

    @Test
    void sendMessageShouldAcceptEnvelopeFromDifferentAuthenticatedSessionForSameUserDevice() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(), deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().scheme()).isEqualTo("X3DH-DEVICE-AES-GCM");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithStaleMessageCounter() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return Optional.of(new UserEncryptionEnvelopeCounter(
                                UUID.randomUUID(),
                                currentDevice.getId(),
                                recipientDevice.getId(),
                                deviceRatchetPublicKey(recipientDevice),
                                deviceInitiatorEphemeralPublicKey(recipientDevice),
                                1,
                                Instant.parse("2026-03-24T11:59:00Z")
                        ));
                    }
                    return Optional.empty();
                });

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope message counter is stale");
    }

    @Test
    void sendMessageShouldRejectNewRatchetChainWithoutCounterZero() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":2"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":2")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope must start at counter zero");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWithExcessiveCounterJump() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return Optional.of(new UserEncryptionEnvelopeCounter(
                                UUID.randomUUID(),
                                currentDevice.getId(),
                                recipientDevice.getId(),
                                deviceRatchetPublicKey(recipientDevice),
                                deviceInitiatorEphemeralPublicKey(recipientDevice),
                                1,
                                Instant.parse("2026-03-24T11:59:00Z")
                        ));
                    }
                    return Optional.empty();
                });

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":5000")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope message counter advanced too far");
    }

    @Test
    void sendMessageShouldRejectEnvelopeWhenChainInitiatorKeyChanges() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return Optional.of(new UserEncryptionEnvelopeCounter(
                                UUID.randomUUID(),
                                currentDevice.getId(),
                                recipientDevice.getId(),
                                deviceRatchetPublicKey(recipientDevice),
                                x25519PublicJwk("other-initiator"),
                                1,
                                Instant.parse("2026-03-24T11:59:00Z")
                        ));
                    }
                    return Optional.empty();
                });

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":2")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope chain metadata is invalid");
    }

    @Test
    void sendMessageShouldBackfillMissingCounterInitiatorKey() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        UserEncryptionEnvelopeCounter staleCounter = new UserEncryptionEnvelopeCounter(
                UUID.randomUUID(),
                currentDevice.getId(),
                recipientDevice.getId(),
                deviceRatchetPublicKey(recipientDevice),
                null,
                1,
                Instant.parse("2026-03-24T11:59:00Z")
        );
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return Optional.of(staleCounter);
                    }
                    return Optional.empty();
                });

        messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                                .replace("\"messageCounter\":0", "\"messageCounter\":2")
                                )
                        )
                )
        );

        assertThat(staleCounter.getInitiatorEphemeralPublicKey())
                .isEqualTo(deviceInitiatorEphemeralPublicKey(recipientDevice));
        verify(userEncryptionEnvelopeCounterRepository).save(staleCounter);
    }

    @Test
    void sendMessageShouldRejectConcurrentBootstrapCounterReuseAfterConflictingInsert() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        UserEncryptionDevice recipientDevice = device(recipient, UUID.randomUUID(), "recipient-device");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(currentUser.getId(), recipient.getId())))
                .thenReturn(List.of(currentDevice, recipientDevice));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        int[] conflictingReads = {0};
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenAnswer(invocation -> {
                    UUID senderDeviceId = invocation.getArgument(0);
                    UUID recipientDeviceId = invocation.getArgument(1);
                    String ratchetPublicKey = invocation.getArgument(2);
                    if (senderDeviceId.equals(currentDevice.getId())
                            && recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        conflictingReads[0] += 1;
                        if (conflictingReads[0] == 1) {
                            return Optional.empty();
                        }
                        return Optional.of(new UserEncryptionEnvelopeCounter(
                                UUID.randomUUID(),
                                currentDevice.getId(),
                                recipientDevice.getId(),
                                deviceRatchetPublicKey(recipientDevice),
                                deviceInitiatorEphemeralPublicKey(recipientDevice),
                                0,
                                Instant.parse("2026-03-24T11:59:00Z")
                        ));
                    }
                    return Optional.empty();
                });
        when(userEncryptionEnvelopeCounterRepository.insertIfAbsent(any(), any(), any(), any(), any(), anyInt(), any(Instant.class)))
                .thenAnswer(invocation -> {
                    UUID recipientDeviceId = invocation.getArgument(2);
                    String ratchetPublicKey = invocation.getArgument(3);
                    if (recipientDeviceId.equals(recipientDevice.getId())
                            && ratchetPublicKey.equals(deviceRatchetPublicKey(recipientDevice))) {
                        return 0;
                    }
                    return 1;
                });

        assertThatThrownBy(() -> messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        clientMessageId(),
                        null,
                        new EncryptedMessagePayloadRequest(
                                "X3DH-DEVICE-AES-GCM",
                                Map.of(
                                        currentDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, currentDevice, "self", "iv-self"),
                                        recipientDevice.getId().toString(),
                                        deviceEnvelope(currentUser, currentDevice, recipientDevice, "peer", "iv-peer")
                                )
                        )
                )
        )).hasMessageContaining("Encrypted device envelope message counter is stale");
    }

    @Test
    void listMessagesShouldReturnMalformedEncryptedMessagesWithoutPayload() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        ChatMessage malformedMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                "ciphertext-malformed",
                "RSA-OAEP-256/AES-GCM",
                "iv-malformed",
                objectMapper.writeValueAsString(Map.of(sender.getId().toString(), "sender-only-key")),
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);
        ChatMessage validMessage = withServerOrder(new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                "ciphertext-valid",
                "RSA-OAEP-256/AES-GCM",
                "iv-valid",
                objectMapper.writeValueAsString(Map.of(
                        sender.getId().toString(), "sender-key",
                        currentUser.getId().toString(), "recipient-key"
                )),
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
        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, true);

        assertThat(response).hasSize(2);
        assertThat(response).extracting(MessageResponse::id)
                .containsExactly(malformedMessage.getId(), validMessage.getId());
        assertThat(response.get(0).encryptedPayload()).isNull();
        assertThat(response.get(1).encryptedPayload()).isNotNull();
        verify(messageReceiptRepository).findAllByUserIdAndChatIdAndMessageIdIn(
                currentUser.getId(),
                chatId,
                List.of(malformedMessage.getId(), validMessage.getId())
        );
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
                "ciphertext-b",
                "RSA-OAEP-256/AES-GCM",
                "iv-b",
                objectMapper.writeValueAsString(Map.of(
                        sender.getId().toString(), "sender-key-b",
                        currentUser.getId().toString(), "recipient-key-b"
                )),
                createdAt
        ), 20L);
        ChatMessage lowerOrderMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a0"),
                chatId,
                sender.getId(),
                "ciphertext-a",
                "RSA-OAEP-256/AES-GCM",
                "iv-a",
                objectMapper.writeValueAsString(Map.of(
                        sender.getId().toString(), "sender-key-a",
                        currentUser.getId().toString(), "recipient-key-a"
                )),
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
    void listMessagesShouldLoadVisibleRecipientDevicesOncePerPage() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        ChatMessage firstMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a1"),
                chatId,
                sender.getId(),
                "ciphertext-a",
                "X3DH-DEVICE-AES-GCM",
                "iv-a",
                objectMapper.writeValueAsString(Map.of(currentDevice.getId().toString(), "recipient-device-payload-a")),
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);
        ChatMessage secondMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000a2"),
                chatId,
                sender.getId(),
                "ciphertext-b",
                "X3DH-DEVICE-AES-GCM",
                "iv-b",
                objectMapper.writeValueAsString(Map.of(currentDevice.getId().toString(), "recipient-device-payload-b")),
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
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).extracting(MessageResponse::id)
                .containsExactly(firstMessage.getId(), secondMessage.getId());
        verify(userEncryptionDeviceRepository, times(1))
                .findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId());
    }

    @Test
    void listMessagesShouldReadEncryptedPayloadFromNormalizedRecipientRows() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        ChatMessage message = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000d1"),
                chatId,
                sender.getId(),
                "ciphertext-a",
                "X3DH-DEVICE-AES-GCM",
                "iv-a",
                "",
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(message));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));
        when(chatMessageRecipientPayloadRepository.findAllByMessageIdInAndRecipientUserId(
                argThat(messageIds -> messageIds != null
                        && messageIds.size() == 1
                        && messageIds.contains(message.getId())),
                eq(currentUser.getId())
        )).thenReturn(List.of(
                new ChatMessageRecipientPayload(
                        message.getId(),
                        currentDevice.getId(),
                        currentUser.getId(),
                        "normalized-recipient-payload",
                        message.getCreatedAt()
                )
        ));

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).hasSize(1);
        assertThat(response.get(0).encryptedPayload()).isNotNull();
        assertThat(response.get(0).encryptedPayload().encryptedKeysByRecipientId())
                .hasSize(1)
                .containsEntry(currentDevice.getId().toString(), "normalized-recipient-payload");
    }

    @Test
    void listMessagesShouldIgnoreLegacyEncryptedKeysJsonWithoutNormalizedRows() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        UserEncryptionDevice currentDevice = device(currentUser, UUID.randomUUID(), "current-device");
        ChatMessage message = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000d2"),
                chatId,
                sender.getId(),
                "ciphertext-a",
                "X3DH-DEVICE-AES-GCM",
                "iv-a",
                objectMapper.writeValueAsString(Map.of(currentDevice.getId().toString(), "legacy-json-payload")),
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(message));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of(currentDevice));

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).hasSize(1);
        assertThat(response.get(0).encryptedPayload()).isNull();
    }

    @Test
    void listMessagesShouldKeepDirectMessagesWhenOnlyHistoricalRecipientDevicesMatch() throws Exception {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("alice");
        UserAccount sender = user("north");
        UUID historicalDeviceId = UUID.randomUUID();
        ChatMessage historicalDirectMessage = withServerOrder(new ChatMessage(
                UUID.fromString("00000000-0000-0000-0000-0000000000c1"),
                chatId,
                sender.getId(),
                "ciphertext-historical",
                "X3DH-DEVICE-AES-GCM",
                "iv-historical",
                objectMapper.writeValueAsString(Map.of(
                        historicalDeviceId.toString(),
                        "recipient-device-payload-historical"
                )),
                Instant.parse("2026-03-24T12:00:00Z")
        ), 10L);

        when(authService.requireAuthenticatedUser("alice")).thenReturn(currentUser);
        when(chatService.requireChatMembership(chatId, currentUser)).thenReturn(
                new ChatRoom(chatId, null, true, Instant.parse("2026-03-24T11:00:00Z"))
        );
        when(chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(eq(chatId), eq(currentUser.getId()), any()))
                .thenReturn(List.of(historicalDirectMessage));
        when(userAccountRepository.findAllByIdIn(any())).thenReturn(List.of(sender));
        when(messageReceiptRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageReactionRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(authService.toParticipant(sender)).thenReturn(participant(sender));
        when(userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(currentUser.getId()))
                .thenReturn(List.of());

        List<MessageResponse> response = messageService.listMessages(chatId, "alice", null, 50, false);

        assertThat(response).hasSize(1);
        assertThat(response.get(0).id()).isEqualTo(historicalDirectMessage.getId());
        assertThat(response.get(0).encryptedPayload()).isNull();
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
        when(chatMessageRepository.findById(messageId)).thenReturn(java.util.Optional.of(message));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        messageService.deleteMessage(chatId, messageId, "north", "EVERYONE");

        ArgumentCaptor<MessageDeletionBroadcastEvent> eventCaptor = ArgumentCaptor.forClass(MessageDeletionBroadcastEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        verify(chatMessageRepository).delete(message);
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
        when(chatMessageRepository.findById(messageId)).thenReturn(Optional.of(message));

        assertThatThrownBy(() -> messageService.deleteMessage(chatId, messageId, "north", "EVERYONE"))
                .hasMessageContaining("only available for your own messages");

        verify(chatMessageRepository, never()).delete(any(ChatMessage.class));
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

    private UserEncryptionDevice device(UserAccount user, UUID sessionId, String deviceName) {
        try {
            UUID deviceId = UUID.randomUUID();
            KeyPair signatureKeyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
            deviceSignatureKeyPairs.put(deviceId, signatureKeyPair);
            String signedPrekeyPublicKey = x25519PublicJwk("signed-" + deviceId);
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(signatureKeyPair.getPrivate());
            signer.update(signedPrekeySignaturePayload(x25519RawBytes("signed-" + deviceId)));
            return new UserEncryptionDevice(
                    deviceId,
                    user.getId(),
                    deviceName,
                    x25519PublicJwk("identity-" + deviceId),
                    "X25519",
                    ed25519PublicJwk(signatureKeyPair),
                    "Ed25519",
                    7,
                    signedPrekeyPublicKey,
                    Base64.getEncoder().encodeToString(signer.sign()),
                    "X25519",
                    Instant.parse("2026-03-24T11:00:00Z"),
                    Instant.parse("2026-03-24T11:00:00Z"),
                    null
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to create test encryption device", exception);
        }
    }

    private UserEncryptionOneTimePrekey oneTimePrekey(
            UserEncryptionDevice device,
            int keyId,
            Instant claimedAt,
            UUID claimedBySenderDeviceId,
            Instant acceptedAt,
            String acceptedInitiatorEphemeralPublicKey,
            String acceptedRatchetPublicKey
    ) {
        return new UserEncryptionOneTimePrekey(
                UUID.randomUUID(),
                device.getId(),
                keyId,
                "{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"otp\"}",
                Instant.parse("2026-03-24T11:00:00Z"),
                claimedAt,
                claimedBySenderDeviceId,
                acceptedAt,
                acceptedInitiatorEphemeralPublicKey,
                acceptedRatchetPublicKey
        );
    }

    private String deviceEnvelope(
            UserAccount senderUser,
            UserEncryptionDevice senderDevice,
            UserEncryptionDevice recipientDevice,
            String ciphertext,
            String iv
    ) {
        return """
                {"aadVersion":1,"senderUserId":"%s","senderDeviceId":"%s","recipientDeviceId":"%s","senderIdentityKey":"%s","senderIdentitySignatureKey":"%s","initiatorEphemeralPublicKey":"%s","ratchetPublicKey":"%s","recipientSignedPrekeyId":%s,"recipientOneTimePrekeyId":null,"messageCounter":0,"ciphertext":"%s","iv":"%s"}
                """
                .formatted(
                        senderUser.getId(),
                        senderDevice.getId(),
                        recipientDevice.getId(),
                        jsonEscape(senderDevice.getIdentityKey()),
                        jsonEscape(senderDevice.getIdentitySignatureKey()),
                        jsonEscape(deviceInitiatorEphemeralPublicKey(recipientDevice)),
                        jsonEscape(deviceRatchetPublicKey(recipientDevice)),
                        recipientDevice.getSignedPrekeyId(),
                        jsonEscape(base64(ciphertext)),
                        jsonEscape(base64Fixed(iv, 12))
                )
                .replace("\n", "")
                .trim();
    }

    private String groupSharedEnvelope(
            UUID chatId,
            UserAccount senderUser,
            UserEncryptionDevice senderDevice,
            String ciphertext,
            String iv
    ) {
        try {
            String senderKeyId = "sender-key-" + senderDevice.getId();
            String encodedCiphertext = base64(ciphertext);
            String encodedIv = base64Fixed(iv, 12);
            Map<String, Object> signaturePayload = new LinkedHashMap<>();
            signaturePayload.put("aadVersion", 1);
            signaturePayload.put("chatId", chatId);
            signaturePayload.put("senderUserId", senderUser.getId());
            signaturePayload.put("senderDeviceId", senderDevice.getId());
            signaturePayload.put("senderKeyId", senderKeyId);
            signaturePayload.put("messageCounter", 0);
            signaturePayload.put("iv", encodedIv);
            signaturePayload.put("ciphertext", encodedCiphertext);

            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(deviceSignatureKeyPairs.get(senderDevice.getId()).getPrivate());
            signer.update(objectMapper.writeValueAsBytes(signaturePayload));
            String signature = Base64.getEncoder().encodeToString(signer.sign());

            return """
                    {"aadVersion":1,"chatId":"%s","senderUserId":"%s","senderDeviceId":"%s","senderKeyId":"%s","messageCounter":0,"ciphertext":"%s","iv":"%s","signature":"%s"}
                    """
                    .formatted(
                            chatId,
                            senderUser.getId(),
                            senderDevice.getId(),
                            senderKeyId,
                            jsonEscape(encodedCiphertext),
                            jsonEscape(encodedIv),
                            jsonEscape(signature)
                    )
                    .replace("\n", "")
                    .trim();
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to create signed group envelope for test", exception);
        }
    }

    private String deviceInitiatorEphemeralPublicKey(UserEncryptionDevice recipientDevice) {
        return x25519PublicJwk("initiator-" + recipientDevice.getId());
    }

    private String deviceRatchetPublicKey(UserEncryptionDevice recipientDevice) {
        return x25519PublicJwk("ratchet-" + recipientDevice.getId());
    }

    private String x25519PublicJwk(String seed) {
        byte[] bytes = x25519RawBytes(seed);
        return """
                {"kty":"OKP","crv":"X25519","x":"%s"}
                """.formatted(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes))
                .replace("\n", "")
                .trim();
    }

    private byte[] x25519RawBytes(String seed) {
        byte[] bytes = new byte[32];
        byte[] source = seed.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < bytes.length; index += 1) {
            bytes[index] = source[index % source.length];
        }
        return bytes;
    }

    private String ed25519PublicJwk(KeyPair keyPair) {
        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] raw = new byte[32];
        System.arraycopy(encoded, encoded.length - raw.length, raw, 0, raw.length);
        return """
                {"kty":"OKP","crv":"Ed25519","x":"%s"}
                """.formatted(Base64.getUrlEncoder().withoutPadding().encodeToString(raw))
                .replace("\n", "")
                .trim();
    }

    private String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] signedPrekeySignaturePayload(byte[] rawPublicKey) {
        byte[] context = "north-signed-prekey-v1".getBytes(StandardCharsets.UTF_8);
        byte[] payload = new byte[context.length + 1 + rawPublicKey.length];
        System.arraycopy(context, 0, payload, 0, context.length);
        payload[context.length] = 0;
        System.arraycopy(rawPublicKey, 0, payload, context.length + 1, rawPublicKey.length);
        return payload;
    }

    private String base64Fixed(String value, int length) {
        byte[] bytes = new byte[length];
        byte[] source = value.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < bytes.length; index += 1) {
            bytes[index] = source[index % source.length];
        }
        return Base64.getEncoder().encodeToString(bytes);
    }

    private String jsonEscape(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }
}


