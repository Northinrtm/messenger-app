package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private final ApplicationEventPublisher eventPublisher;
    private final MessengerTelemetry telemetry;
    private final MessageSupport messageSupport;
    private final MessageDispatchOutboxService messageDispatchOutboxService;
    private final ChatAttachmentService chatAttachmentService;
    private final ChatMessageLinkService chatMessageLinkService;
    private final PendingOutgoingMessageService pendingOutgoingMessageService;
    private final EntityManager entityManager;
    private final MessageContentCryptoService messageContentCryptoService;

    MessageCommandService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            ApplicationEventPublisher eventPublisher,
            MessengerTelemetry telemetry,
            MessageSupport messageSupport,
            MessageDispatchOutboxService messageDispatchOutboxService,
            ChatAttachmentService chatAttachmentService,
            ChatMessageLinkService chatMessageLinkService,
            PendingOutgoingMessageService pendingOutgoingMessageService,
            EntityManager entityManager,
            MessageContentCryptoService messageContentCryptoService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.eventPublisher = eventPublisher;
        this.telemetry = telemetry;
        this.messageSupport = messageSupport;
        this.messageDispatchOutboxService = messageDispatchOutboxService;
        this.chatAttachmentService = chatAttachmentService;
        this.chatMessageLinkService = chatMessageLinkService;
        this.pendingOutgoingMessageService = pendingOutgoingMessageService;
        this.entityManager = entityManager;
        this.messageContentCryptoService = messageContentCryptoService;
    }

    @Transactional
    MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        Timer.Sample telemetrySample = telemetry.startSample();
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);
        chatService.reopenDeletedChatForUser(room, currentUser);
        List<UserAccount> participants = chatService.findParticipants(chatId);
        String clientMessageId = messageSupport.normalizeClientMessageId(request.clientMessageId());
        UUID replyToMessageId = messageSupport.validateReplyTarget(room, currentUser, request.replyToMessageId());
        MessageSupport.ForwardedMessageContext forwardedContext = messageSupport.validateForwardTarget(
                currentUser,
                request.forwardedFromMessageId()
        );

        MessageResponse existingResponse = messageSupport.findExistingMessageResponse(room, currentUser, clientMessageId);
        if (existingResponse != null) {
            ChatMessage existingMessage = chatMessageRepository
                    .findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), clientMessageId)
                    .orElse(null);
            if (existingMessage != null) {
                messageDispatchOutboxService.enqueue(new MessageDispatchEvent(
                        chatId,
                        existingMessage.getId(),
                        clientMessageId,
                        MessageDispatchMode.ACK_ONLY
                ));
            }
            pendingOutgoingMessageService.deleteByUserIdAndClientMessageId(currentUser.getId(), clientMessageId);
            telemetry.recordMessageSend(
                    telemetrySample,
                    room,
                    participants.size(),
                    "deduplicated",
                    chatId,
                    clientMessageId
            );
            MessageSendDiagnostics.logOutcome(
                    "server",
                    "command.deduplicated",
                    "existing_message",
                    chatId,
                    existingMessage != null ? existingMessage.getId() : existingResponse.id(),
                    username,
                    clientMessageId
            );
            return existingResponse;
        }

        boolean attachmentsPresent = (request.attachmentIds() != null && !request.attachmentIds().isEmpty())
                || forwardedContext != null;
        String plainContent = messageSupport.validatePlainPayload(request.plainPayload(), attachmentsPresent);

        try {
            UUID messageId = UUID.randomUUID();
            EncryptedMessageContent encryptedContent = messageContentCryptoService.encrypt(
                    chatId,
                    messageId,
                    currentUser.getId(),
                    plainContent
            );
            ChatMessage message = new ChatMessage(
                    messageId,
                    chatId,
                    currentUser.getId(),
                    encryptedContent.ciphertext(),
                    encryptedContent.iv(),
                    encryptedContent.keyVersion(),
                    encryptedContent.algorithm(),
                    clientMessageId,
                    replyToMessageId,
                    null,
                    forwardedContext != null ? forwardedContext.originalSenderId() : null,
                    Instant.now()
            );
            ChatMessage persistedMessage = chatMessageRepository.saveAndFlush(message);
            entityManager.refresh(persistedMessage);
            persistedMessage.cacheDecryptedContent(plainContent);
            chatAttachmentService.attachUploadedAttachments(
                    currentUser,
                    chatId,
                    persistedMessage.getId(),
                    request.attachmentIds()
            );
            chatMessageLinkService.syncLinks(persistedMessage, plainContent);
            if (forwardedContext != null) {
                chatAttachmentService.copyAttachmentsForForward(
                        forwardedContext.sourceMessage().getId(),
                        chatId,
                        persistedMessage.getId()
                );
                // Only the new copy is a forward; it carries forwardedFromSenderId. The original
                // source message must stay untouched, otherwise the author's own message would be
                // mislabelled as "forwarded" for every participant.
            }

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

            MessageSupport.MessageReceiptSummary summary = messageSupport.summarizeReceipts(receipts);
            MessageSnippetResponse replyTo = messageSupport.loadReplySnippetsByMessageId(
                    List.of(persistedMessage),
                    Map.of(currentUser.getId(), currentUser),
                    room,
                    currentUser.getId()
            ).get(persistedMessage.getId());
            MessageResponse responseForSender = messageSupport.toResponse(
                    persistedMessage,
                    currentUser,
                    currentUser.getId(),
                    summary,
                    List.of(),
                    clientMessageId,
                    replyTo,
                    messageSupport.toPlainPayload(persistedMessage),
                    messageSupport.loadAttachmentResponses(List.of(persistedMessage.getId()))
                            .getOrDefault(persistedMessage.getId(), List.of())
            );

            messageDispatchOutboxService.enqueue(new MessageDispatchEvent(
                    chatId,
                    persistedMessage.getId(),
                    clientMessageId,
                    MessageDispatchMode.FULL
            ));
            eventPublisher.publishEvent(new MessageStoredDeferredEvent(
                    chatId,
                    persistedMessage.getId(),
                    clientMessageId,
                    currentUser.getId()
            ));
            pendingOutgoingMessageService.deleteByUserIdAndClientMessageId(currentUser.getId(), clientMessageId);
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
            MessageResponse deduplicatedResponse = messageSupport.findExistingMessageResponse(room, currentUser, clientMessageId);
            if (deduplicatedResponse != null) {
                if (existingMessage != null) {
                    messageDispatchOutboxService.enqueue(new MessageDispatchEvent(
                            chatId,
                            existingMessage.getId(),
                            clientMessageId,
                            MessageDispatchMode.ACK_ONLY
                    ));
                }
                pendingOutgoingMessageService.deleteByUserIdAndClientMessageId(currentUser.getId(), clientMessageId);
                telemetry.recordMessageSend(
                        telemetrySample,
                        room,
                        participants.size(),
                        "deduplicated",
                        chatId,
                        clientMessageId
                );
                MessageSendDiagnostics.logOutcome(
                        "server",
                        "command.deduplicated_race",
                        "existing_message",
                        chatId,
                        existingMessage != null ? existingMessage.getId() : deduplicatedResponse.id(),
                        username,
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
            MessageSendDiagnostics.logFailure(
                    "server",
                    "command.persist",
                    chatId,
                    null,
                    username,
                    clientMessageId,
                    null,
                    exception.getMessage(),
                    List.of(exception.getClass().getSimpleName()),
                    exception
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
            if (exception instanceof ResponseStatusException responseStatusException) {
                MessageSendDiagnostics.logFailure(
                        "server",
                        "command.rejected",
                        chatId,
                        null,
                        username,
                        clientMessageId,
                        responseStatusException.getStatusCode().value(),
                        responseStatusException.getReason() != null
                                ? responseStatusException.getReason()
                                : HttpStatus.valueOf(responseStatusException.getStatusCode().value()).getReasonPhrase(),
                        List.of(exception.getClass().getSimpleName()),
                        responseStatusException
                );
            } else {
                MessageSendDiagnostics.logFailure(
                        "server",
                        "command.unhandled",
                        chatId,
                        null,
                        username,
                        clientMessageId,
                        null,
                        exception.getMessage(),
                        List.of(exception.getClass().getSimpleName()),
                        exception
                );
            }
            throw exception;
        }
    }

    @Transactional
    void deleteMessage(UUID chatId, UUID messageId, String username, String rawScope) {
        deleteMessages(chatId, List.of(messageId), username, rawScope);
    }

    @Transactional
    void deleteMessages(UUID chatId, List<UUID> messageIds, String username, String rawScope) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);

        LinkedHashSet<UUID> uniqueMessageIds = new LinkedHashSet<>(messageIds);
        if (uniqueMessageIds.isEmpty()) {
            return;
        }
        List<UUID> orderedMessageIds = List.copyOf(uniqueMessageIds);
        List<ChatMessage> foundMessages = chatMessageRepository.findAllById(orderedMessageIds);
        if (foundMessages.size() != orderedMessageIds.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found");
        }

        Map<UUID, ChatMessage> messagesById = new HashMap<>();
        for (ChatMessage message : foundMessages) {
            if (!message.getChatId().equals(chatId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
            }
            messagesById.put(message.getId(), message);
        }

        List<ChatMessage> orderedMessages = new ArrayList<>(orderedMessageIds.size());
        for (UUID messageId : orderedMessageIds) {
            ChatMessage message = messagesById.get(messageId);
            if (message == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found");
            }
            orderedMessages.add(message);
        }

        MessageSupport.DeleteScope scope = messageSupport.parseDeleteScope(rawScope);
        if (scope == MessageSupport.DeleteScope.SELF) {
            if (!room.isDirect()) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Delete for self is not available in group chats"
                );
            }
            Set<UUID> existingDeletedMessageIds = userDeletedMessageRepository
                    .findAllByUserIdAndMessageIdIn(currentUser.getId(), orderedMessageIds)
                    .stream()
                    .map(UserDeletedMessage::getMessageId)
                    .collect(java.util.stream.Collectors.toCollection(HashSet::new));
            List<UserDeletedMessage> tombstonesToCreate = orderedMessageIds.stream()
                    .filter(messageId -> !existingDeletedMessageIds.contains(messageId))
                    .map(messageId -> new UserDeletedMessage(
                            UUID.randomUUID(),
                            currentUser.getId(),
                            messageId,
                            Instant.now()
                    ))
                    .toList();
            if (!tombstonesToCreate.isEmpty()) {
                userDeletedMessageRepository.saveAll(tombstonesToCreate);
            }
            MessageLifecycleAuditListener.logDeleteForSelf(currentUser.getId(), chatId, orderedMessageIds);
            orderedMessageIds.forEach(messageId -> eventPublisher.publishEvent(new MessageDeletionBroadcastEvent(
                    chatId,
                    messageId,
                    List.of(currentUser.getUsername())
            )));
            return;
        }

        boolean deletingForeignMessages = orderedMessages.stream()
                .anyMatch(message -> !message.getSenderId().equals(currentUser.getId()));
        // In a 1:1 chat either participant may delete any message for both sides. In a group,
        // deleting someone else's message for everyone still requires moderator/owner rights.
        if (deletingForeignMessages && !room.isDirect() && !chatService.hasGroupModeratorOrOwnerAccess(room, currentUser)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Delete for everyone is only available for your own messages unless you moderate the group"
            );
        }

        chatService.removePinnedMessages(room, orderedMessageIds);

        List<UserAccount> participants = chatService.findParticipants(chatId);
        orderedMessages.forEach(message -> chatAttachmentService.deleteAttachmentsForMessage(message.getId()));
        chatMessageRepository.deleteAll(orderedMessages);
        MessageLifecycleAuditListener.logDeleteForEveryone(currentUser.getId(), chatId, orderedMessageIds);
        List<String> usernames = participants.stream().map(UserAccount::getUsername).toList();
        orderedMessageIds.forEach(messageId -> eventPublisher.publishEvent(new MessageDeletionBroadcastEvent(
                chatId,
                messageId,
                usernames
        )));
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

        List<UserAccount> participants = chatService.findParticipants(chatId);
        String plainContent = messageSupport.validatePlainPayload(
                request.plainPayload(),
                chatAttachmentService.hasAttachments(message.getId())
        );
        EncryptedMessageContent encryptedContent = messageContentCryptoService.encrypt(
                chatId,
                message.getId(),
                currentUser.getId(),
                plainContent
        );
        message.updateEncryptedContent(
                encryptedContent.ciphertext(),
                encryptedContent.iv(),
                encryptedContent.keyVersion(),
                encryptedContent.algorithm(),
                plainContent,
                Instant.now()
        );
        chatMessageRepository.saveAndFlush(message);
        chatMessageLinkService.syncLinks(message, plainContent);
        messageDispatchOutboxService.enqueue(new MessageDispatchEvent(
                chatId,
                message.getId(),
                null,
                MessageDispatchMode.FULL
        ));

        UserAccount sender = userAccountRepository.findById(message.getSenderId()).orElse(currentUser);
        MessageSupport.MessageReceiptSummary summary = messageSupport.loadReceiptSummaries(List.of(message.getId()))
                .getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty());
        MessageSnippetResponse replyTo = messageSupport.loadReplySnippetsByMessageId(
                List.of(message),
                Map.of(sender.getId(), sender),
                room,
                currentUser.getId()
        )
                .get(message.getId());
        return messageSupport.toResponse(
                message,
                sender,
                currentUser.getId(),
                summary,
                List.of(),
                null,
                replyTo,
                messageSupport.toPlainPayload(message),
                messageSupport.loadAttachmentResponses(List.of(message.getId()))
                        .getOrDefault(message.getId(), List.of())
        );
    }
}
