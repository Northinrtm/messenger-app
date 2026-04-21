package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.MessageDeletionEventResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import jakarta.persistence.EntityManager;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import com.north.messenger.observability.MessengerTelemetry;
import io.micrometer.core.instrument.Timer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
class MessageCommandService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserDeletedMessageRepository userDeletedMessageRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final ApplicationEventPublisher eventPublisher;
    private final MessengerTelemetry telemetry;
    private final MessageSupport messageSupport;
    private final MessageDispatchService messageDispatchService;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private final EntityManager entityManager;

    MessageCommandService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            ApplicationEventPublisher eventPublisher,
            MessengerTelemetry telemetry,
            MessageSupport messageSupport,
            MessageDispatchService messageDispatchService,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService,
            EntityManager entityManager
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.eventPublisher = eventPublisher;
        this.telemetry = telemetry;
        this.messageSupport = messageSupport;
        this.messageDispatchService = messageDispatchService;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
        this.entityManager = entityManager;
    }

    @Transactional
    MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        Timer.Sample telemetrySample = telemetry.startSample();
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);
        List<UserAccount> participants = chatService.findParticipants(chatId);
        String clientMessageId = messageSupport.normalizeClientMessageId(request.clientMessageId());
        UUID replyToMessageId = messageSupport.validateReplyTarget(chatId, request.replyToMessageId());

        MessageResponse existingResponse = messageSupport.findExistingMessageResponse(chatId, currentUser, clientMessageId);
        if (existingResponse != null) {
            ChatMessage existingMessage = chatMessageRepository
                    .findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), clientMessageId)
                    .orElse(null);
            if (existingMessage != null) {
                eventPublisher.publishEvent(new MessageDispatchEvent(
                        chatId,
                        existingMessage.getId(),
                        clientMessageId,
                        MessageDispatchMode.ACK_ONLY
                ));
            }
            telemetry.recordMessageSend(
                    telemetrySample,
                    room,
                    participants.size(),
                    "deduplicated",
                    chatId,
                    clientMessageId
            );
            return existingResponse;
        }

        EncryptedMessagePayloadRequest encryptedPayload = request.encryptedPayload();
        if (encryptedPayload == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "End-to-end encrypted payload is required"
            );
        }

        String encryptedKeysJson = messageSupport.serializeEncryptedKeys(
                messageSupport.validateEncryptedPayload(encryptedPayload, room, currentUser, participants)
        );
        MessageSupport.StoredEncryptedEnvelope storedEnvelope = messageSupport.extractStoredEnvelope(encryptedPayload);
        ChatGroupHistoryKeyService.ValidatedGroupMessageHistoryEnvelope historyEnvelope =
                chatGroupHistoryKeyService.validateMessageHistoryEnvelope(room, encryptedPayload.historyEnvelope());

        try {
            ChatMessage message = new ChatMessage(
                    UUID.randomUUID(),
                    chatId,
                    currentUser.getId(),
                    storedEnvelope.ciphertext(),
                    encryptedPayload.scheme(),
                    storedEnvelope.iv(),
                    encryptedKeysJson,
                    historyEnvelope == null ? null : historyEnvelope.historyKeyId(),
                    historyEnvelope == null ? null : historyEnvelope.serializedEnvelope(),
                    clientMessageId,
                    replyToMessageId,
                    Instant.now()
            );
            ChatMessage persistedMessage = chatMessageRepository.saveAndFlush(message);
            entityManager.refresh(persistedMessage);

            List<MessageReceipt> receipts = participants.stream()
                    .filter(participant -> !participant.getId().equals(currentUser.getId()))
                    .map(participant -> new MessageReceipt(
                            UUID.randomUUID(),
                            persistedMessage.getId(),
                            participant.getId(),
                            null,
                            null
                    ))
                    .toList();
            if (!receipts.isEmpty()) {
                messageReceiptRepository.saveAll(receipts);
            }

            chatService.restoreDeletedChatStateForUsers(
                    chatId,
                    participants.stream().map(UserAccount::getId).toList()
            );

            MessageSupport.MessageReceiptSummary summary = messageSupport.summarizeReceipts(receipts);
            MessageSnippetResponse replyTo = messageSupport.loadReplySnippetsByMessageId(
                    List.of(persistedMessage),
                    Map.of(currentUser.getId(), currentUser)
            ).get(persistedMessage.getId());
            MessageResponse responseForSender = messageSupport.toResponse(
                    persistedMessage,
                    currentUser,
                    currentUser.getId(),
                    summary,
                    List.of(),
                    clientMessageId,
                    replyTo
            );

            eventPublisher.publishEvent(new MessageDispatchEvent(
                    chatId,
                    persistedMessage.getId(),
                    clientMessageId,
                    MessageDispatchMode.FULL
            ));
            telemetry.recordMessageSend(
                    telemetrySample,
                    room,
                    participants.size(),
                    "accepted",
                    chatId,
                    clientMessageId
            );
            return responseForSender;
        } catch (DataIntegrityViolationException exception) {
            ChatMessage existingMessage = chatMessageRepository
                    .findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), clientMessageId)
                    .orElse(null);
            MessageResponse deduplicatedResponse = messageSupport.findExistingMessageResponse(chatId, currentUser, clientMessageId);
            if (deduplicatedResponse != null) {
                if (existingMessage != null) {
                    eventPublisher.publishEvent(new MessageDispatchEvent(
                            chatId,
                            existingMessage.getId(),
                            clientMessageId,
                            MessageDispatchMode.ACK_ONLY
                    ));
                }
                telemetry.recordMessageSend(
                        telemetrySample,
                        room,
                        participants.size(),
                        "deduplicated",
                        chatId,
                        clientMessageId
                );
                return deduplicatedResponse;
            }

            telemetry.recordMessageSend(
                    telemetrySample,
                    room,
                    participants.size(),
                    "error",
                    chatId,
                    clientMessageId
            );
            throw exception;
        } catch (RuntimeException exception) {
            telemetry.recordMessageSend(
                    telemetrySample,
                    room,
                    participants.size(),
                    "error",
                    chatId,
                    clientMessageId
            );
            throw exception;
        }
    }

    @Transactional
    void deleteMessage(UUID chatId, UUID messageId, String username, String rawScope) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }

        MessageSupport.DeleteScope scope = messageSupport.parseDeleteScope(rawScope);
        if (scope == MessageSupport.DeleteScope.SELF) {
            userDeletedMessageRepository.findByUserIdAndMessageId(currentUser.getId(), messageId)
                    .orElseGet(() -> userDeletedMessageRepository.save(
                            new UserDeletedMessage(UUID.randomUUID(), currentUser.getId(), messageId, Instant.now())
                    ));
            realtimeMessagingGateway.sendToUser(
                    currentUser.getUsername(),
                    "/queue/message-deletions",
                    new MessageDeletionEventResponse(messageId, chatId)
            );
            chatService.notifyChatUpdated(chatId);
            return;
        }

        if (!message.getSenderId().equals(currentUser.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Delete for everyone is only available for your own messages"
            );
        }

        if (Objects.equals(room.getPinnedMessageId(), messageId)) {
            room.clearPinnedMessage();
        }

        List<UserAccount> participants = chatService.findParticipants(chatId);
        chatMessageRepository.delete(message);
        participants.forEach(participant -> realtimeMessagingGateway.sendToUser(
                participant.getUsername(),
                "/queue/message-deletions",
                new MessageDeletionEventResponse(messageId, chatId)
        ));
        chatService.notifyChatUpdated(chatId);
    }

    @Transactional
    MessageResponse updateMessage(UUID chatId, UUID messageId, String username, UpdateMessageRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }
        if (!message.getSenderId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the sender can edit the message");
        }

        EncryptedMessagePayloadRequest encryptedPayload = request.encryptedPayload();
        if (encryptedPayload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload is required");
        }

        List<UserAccount> participants = chatService.findParticipants(chatId);
        String encryptedKeysJson = messageSupport.serializeEncryptedKeys(
                messageSupport.validateEncryptedPayload(encryptedPayload, room, currentUser, participants)
        );
        MessageSupport.StoredEncryptedEnvelope storedEnvelope = messageSupport.extractStoredEnvelope(encryptedPayload);
        ChatGroupHistoryKeyService.ValidatedGroupMessageHistoryEnvelope historyEnvelope =
                chatGroupHistoryKeyService.validateMessageHistoryEnvelope(room, encryptedPayload.historyEnvelope());
        message.updateEncryptedContent(
                storedEnvelope.ciphertext(),
                encryptedPayload.scheme(),
                storedEnvelope.iv(),
                encryptedKeysJson,
                historyEnvelope == null ? null : historyEnvelope.historyKeyId(),
                historyEnvelope == null ? null : historyEnvelope.serializedEnvelope(),
                Instant.now()
        );
        chatMessageRepository.saveAndFlush(message);
        messageDispatchService.broadcastMessage(message, null, "update");

        UserAccount sender = userAccountRepository.findById(message.getSenderId()).orElse(currentUser);
        MessageSupport.MessageReceiptSummary summary = messageSupport.loadReceiptSummaries(List.of(message.getId()))
                .getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty());
        MessageSnippetResponse replyTo = messageSupport.loadReplySnippetsByMessageId(List.of(message), Map.of(sender.getId(), sender))
                .get(message.getId());
        return messageSupport.toResponse(message, sender, currentUser.getId(), summary, List.of(), null, replyTo);
    }
}
