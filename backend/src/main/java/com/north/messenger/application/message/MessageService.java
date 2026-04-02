package com.north.messenger.application.message;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageDeletionEventResponse;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.MessageStatusEventResponse;
import com.north.messenger.api.dto.MessageStatusResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class MessageService {

    private static final List<String> REACTION_KEYS = List.of("LIKE", "DISLIKE", "EYES", "OK");

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserDeletedMessageRepository userDeletedMessageRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    public MessageService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            SimpMessagingTemplate messagingTemplate,
            ObjectMapper objectMapper,
            ApplicationEventPublisher eventPublisher
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public List<MessageResponse> listMessages(UUID chatId, String username, Instant before, int limit) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageRequest = PageRequest.of(0, safeLimit);
        List<ChatMessage> recentMessages = new ArrayList<>(
                before == null
                        ? chatMessageRepository.findVisibleEncryptedByChatIdOrderByCreatedAtDesc(
                                chatId,
                                currentUser.getId(),
                                pageRequest
                        )
                        : chatMessageRepository.findVisibleEncryptedByChatIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                                chatId,
                                before,
                                currentUser.getId(),
                                pageRequest
                        )
        );
        recentMessages.sort((left, right) -> left.getCreatedAt().compareTo(right.getCreatedAt()));

        acknowledgeReceipts(chatId, currentUser, extractIncomingMessageIds(recentMessages, currentUser.getId()), ReceiptUpdateMode.DELIVERED);

        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(
                        recentMessages.stream().map(ChatMessage::getSenderId).toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
        Map<UUID, MessageReceiptSummary> summariesByMessageId = loadReceiptSummaries(
                recentMessages.stream().map(ChatMessage::getId).toList()
        );
        Map<UUID, List<MessageReactionSummaryResponse>> reactionsByMessageId = loadReactionSummaries(
                recentMessages.stream().map(ChatMessage::getId).toList(),
                currentUser.getId()
        );
        Map<UUID, MessageSnippetResponse> repliesByMessageId = loadReplySnippetsByMessageId(
                recentMessages,
                usersById
        );

        return recentMessages.stream()
                .map(message -> toResponse(
                        message,
                        usersById.get(message.getSenderId()),
                        currentUser.getId(),
                        summariesByMessageId.getOrDefault(message.getId(), MessageReceiptSummary.empty()),
                        reactionsByMessageId.getOrDefault(message.getId(), List.of()),
                        null,
                        repliesByMessageId.get(message.getId())
                ))
                .toList();
    }

    @Transactional
    public MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        List<UserAccount> participants = chatService.findParticipants(chatId);
        String clientMessageId = normalizeClientMessageId(request.clientMessageId());
        UUID replyToMessageId = validateReplyTarget(chatId, request.replyToMessageId());

        MessageResponse existingResponse = findExistingMessageResponse(chatId, currentUser, clientMessageId);
        if (existingResponse != null) {
            return existingResponse;
        }

        EncryptedMessagePayloadRequest encryptedPayload = request.encryptedPayload();
        if (encryptedPayload == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "End-to-end encrypted payload is required"
            );
        }

        String content = encryptedPayload.ciphertext();
        String encryptionScheme = encryptedPayload.scheme();
        String encryptionIv = encryptedPayload.iv();
        String encryptedKeysJson = serializeEncryptedKeys(validateEncryptedPayload(encryptedPayload, participants));

        try {
            ChatMessage message = new ChatMessage(
                    UUID.randomUUID(),
                    chatId,
                    currentUser.getId(),
                    content,
                    encryptionScheme,
                    encryptionIv,
                    encryptedKeysJson,
                    clientMessageId,
                    replyToMessageId,
                    Instant.now()
            );
            chatMessageRepository.saveAndFlush(message);

            List<MessageReceipt> receipts = participants.stream()
                    .filter(participant -> !participant.getId().equals(currentUser.getId()))
                    .map(participant -> new MessageReceipt(
                            UUID.randomUUID(),
                            message.getId(),
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

            MessageReceiptSummary summary = summarizeReceipts(receipts);
            MessageResponse responseForSender = toResponse(
                    message,
                    currentUser,
                    currentUser.getId(),
                    summary,
                    List.of(),
                    clientMessageId,
                    loadReplySnippetsByMessageId(List.of(message), Map.of(currentUser.getId(), currentUser))
                            .get(message.getId())
            );
            eventPublisher.publishEvent(new MessageDispatchEvent(chatId, message.getId(), clientMessageId));
            return responseForSender;
        } catch (DataIntegrityViolationException exception) {
            MessageResponse deduplicatedResponse = findExistingMessageResponse(chatId, currentUser, clientMessageId);
            if (deduplicatedResponse != null) {
                return deduplicatedResponse;
            }

            throw exception;
        }
    }

    @Transactional
    public void deleteMessage(UUID chatId, UUID messageId, String username, String rawScope) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }

        DeleteScope scope = parseDeleteScope(rawScope);
        if (scope == DeleteScope.SELF) {
            userDeletedMessageRepository.findByUserIdAndMessageId(currentUser.getId(), messageId)
                    .orElseGet(() -> userDeletedMessageRepository.save(
                            new UserDeletedMessage(UUID.randomUUID(), currentUser.getId(), messageId, Instant.now())
                    ));
            messagingTemplate.convertAndSendToUser(
                    currentUser.getUsername(),
                    "/queue/message-deletions",
                    new MessageDeletionEventResponse(messageId, chatId)
            );
            chatService.notifyChatUpdated(chatId);
            return;
        }

        if (!room.isDirect() && !message.getSenderId().equals(currentUser.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Delete for everyone is only available for your own group messages"
            );
        }

        if (Objects.equals(room.getPinnedMessageId(), messageId)) {
            room.clearPinnedMessage();
        }

        List<UserAccount> participants = chatService.findParticipants(chatId);
        chatMessageRepository.delete(message);
        participants.forEach(participant -> messagingTemplate.convertAndSendToUser(
                participant.getUsername(),
                "/queue/message-deletions",
                new MessageDeletionEventResponse(messageId, chatId)
        ));
        chatService.notifyChatUpdated(chatId);
    }

    @Transactional
    public MessageResponse updateMessage(UUID chatId, UUID messageId, String username, UpdateMessageRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

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
        String encryptedKeysJson = serializeEncryptedKeys(validateEncryptedPayload(encryptedPayload, participants));
        message.updateEncryptedContent(
                encryptedPayload.ciphertext(),
                encryptedPayload.scheme(),
                encryptedPayload.iv(),
                encryptedKeysJson,
                Instant.now()
        );
        chatMessageRepository.saveAndFlush(message);
        broadcastMessage(message, null);

        UserAccount sender = userAccountRepository.findById(message.getSenderId()).orElse(currentUser);
        MessageReceiptSummary summary = loadReceiptSummaries(List.of(message.getId()))
                .getOrDefault(message.getId(), MessageReceiptSummary.empty());
        MessageSnippetResponse replyTo = loadReplySnippetsByMessageId(List.of(message), Map.of(sender.getId(), sender))
                .get(message.getId());
        return toResponse(message, sender, currentUser.getId(), summary, List.of(), null, replyTo);
    }

    @Transactional
    public MessageReactionEventResponse toggleReaction(
            UUID chatId,
            UUID messageId,
            String username,
            ToggleMessageReactionRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
        if (!message.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found in this chat");
        }

        String reactionKey = normalizeReactionKey(request.key());
        messageReactionRepository.findByMessageIdAndUserIdAndReactionKey(messageId, currentUser.getId(), reactionKey)
                .ifPresentOrElse(
                        messageReactionRepository::delete,
                        () -> messageReactionRepository.save(new MessageReaction(
                                UUID.randomUUID(),
                                messageId,
                                currentUser.getId(),
                                reactionKey,
                                Instant.now()
                        ))
                );

        MessageReactionEventResponse event = new MessageReactionEventResponse(
                messageId,
                chatId,
                loadReactionSummaries(List.of(messageId), currentUser.getId())
                        .getOrDefault(messageId, List.of())
        );

        chatService.findParticipants(chatId).forEach(participant -> messagingTemplate.convertAndSendToUser(
                participant.getUsername(),
                "/queue/message-reactions",
                buildReactionEvent(messageId, chatId, participant.getId())
        ));
        return event;
    }

    @Transactional(readOnly = true)
    public void dispatchMessage(MessageDispatchEvent event) {
        ChatMessage message = chatMessageRepository.findById(event.messageId())
                .orElse(null);
        if (message == null) {
            return;
        }
        broadcastMessage(message, event.clientMessageId());
    }

    private void broadcastMessage(ChatMessage message, String senderClientMessageId) {
        UserAccount sender = userAccountRepository.findById(message.getSenderId())
                .orElse(null);
        if (sender == null) {
            return;
        }

        List<UserAccount> participants = chatService.findParticipants(message.getChatId());
        MessageReceiptSummary summary = loadReceiptSummaries(List.of(message.getId()))
                .getOrDefault(message.getId(), MessageReceiptSummary.empty());
        Map<UUID, MessageSnippetResponse> repliesByMessageId = loadReplySnippetsByMessageId(
                List.of(message),
                participants.stream().collect(Collectors.toMap(UserAccount::getId, Function.identity()))
        );

        participants.forEach(participant -> {
            List<MessageReactionSummaryResponse> reactions = loadReactionSummaries(
                    List.of(message.getId()),
                    participant.getId()
            ).getOrDefault(message.getId(), List.of());
            MessageResponse response = participant.getId().equals(sender.getId())
                    ? toResponse(
                            message,
                            sender,
                            participant.getId(),
                            summary,
                            reactions,
                            senderClientMessageId,
                            repliesByMessageId.get(message.getId())
                    )
                    : toResponse(
                            message,
                            sender,
                            participant.getId(),
                            summary,
                            reactions,
                            null,
                            repliesByMessageId.get(message.getId())
                    );
            messagingTemplate.convertAndSendToUser(participant.getUsername(), "/queue/messages", response);
        });
        chatService.notifyChatUpdated(message.getChatId());
    }

    private Map<UUID, MessageSnippetResponse> loadReplySnippetsByMessageId(
            Collection<ChatMessage> messages,
            Map<UUID, UserAccount> knownUsersById
    ) {
        List<ChatMessage> messagesWithReply = messages.stream()
                .filter(message -> message.getReplyToMessageId() != null)
                .toList();
        if (messagesWithReply.isEmpty()) {
            return Map.of();
        }

        Map<UUID, ChatMessage> referencedMessagesById = chatMessageRepository.findAllById(
                        messagesWithReply.stream().map(ChatMessage::getReplyToMessageId).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        if (referencedMessagesById.isEmpty()) {
            return Map.of();
        }

        Set<UUID> missingSenderIds = referencedMessagesById.values().stream()
                .map(ChatMessage::getSenderId)
                .filter(senderId -> !knownUsersById.containsKey(senderId))
                .collect(Collectors.toSet());

        Map<UUID, UserAccount> usersById = new HashMap<>(knownUsersById);
        if (!missingSenderIds.isEmpty()) {
            userAccountRepository.findAllByIdIn(missingSenderIds)
                    .forEach(user -> usersById.put(user.getId(), user));
        }

        return messagesWithReply.stream()
                .map(message -> {
                    ChatMessage referencedMessage = referencedMessagesById.get(message.getReplyToMessageId());
                    if (referencedMessage == null) {
                        return null;
                    }

                    UserAccount sender = usersById.get(referencedMessage.getSenderId());
                    if (sender == null) {
                        return null;
                    }

                    return Map.entry(
                            message.getId(),
                            new MessageSnippetResponse(
                                    referencedMessage.getId(),
                                    authService.toParticipant(sender),
                                    referencedMessage.getCreatedAt(),
                                    summarizeMessagePreview(referencedMessage)
                            )
                    );
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private MessageResponse findExistingMessageResponse(UUID chatId, UserAccount currentUser, String clientMessageId) {
        if (clientMessageId == null) {
            return null;
        }

        ChatMessage existingMessage = chatMessageRepository
                .findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), clientMessageId)
                .orElse(null);
        if (existingMessage == null) {
            return null;
        }

        MessageReceiptSummary summary = loadReceiptSummaries(List.of(existingMessage.getId()))
                .getOrDefault(existingMessage.getId(), MessageReceiptSummary.empty());
        List<MessageReactionSummaryResponse> reactions = loadReactionSummaries(
                List.of(existingMessage.getId()),
                currentUser.getId()
        ).getOrDefault(existingMessage.getId(), List.of());
        return toResponse(
                existingMessage,
                currentUser,
                currentUser.getId(),
                summary,
                reactions,
                existingMessage.getClientMessageId(),
                loadReplySnippetsByMessageId(List.of(existingMessage), Map.of(currentUser.getId(), currentUser))
                        .get(existingMessage.getId())
        );
    }

    @Transactional
    public void acknowledgeDelivered(UUID chatId, String username, MessageReceiptRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        acknowledgeReceipts(chatId, currentUser, request.messageIds(), ReceiptUpdateMode.DELIVERED);
    }

    @Transactional
    public void acknowledgeRead(UUID chatId, String username, MessageReceiptRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        acknowledgeReceipts(chatId, currentUser, request.messageIds(), ReceiptUpdateMode.READ);
    }

    private void acknowledgeReceipts(
            UUID chatId,
            UserAccount currentUser,
            Collection<UUID> rawMessageIds,
            ReceiptUpdateMode updateMode
    ) {
        List<UUID> messageIds = sanitizeMessageIds(rawMessageIds);
        if (messageIds.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        Set<UUID> changedMessageIds = new LinkedHashSet<>();
        List<MessageReceipt> receipts = messageReceiptRepository.findAllByUserIdAndChatIdAndMessageIdIn(
                currentUser.getId(),
                chatId,
                messageIds
        );

        for (MessageReceipt receipt : receipts) {
            boolean changed = updateMode == ReceiptUpdateMode.READ
                    ? receipt.markRead(now)
                    : receipt.markDelivered(now);
            if (changed) {
                changedMessageIds.add(receipt.getMessageId());
            }
        }

        if (!changedMessageIds.isEmpty()) {
            notifyMessageStatusChanged(changedMessageIds);
            if (updateMode == ReceiptUpdateMode.READ) {
                chatService.notifyChatUpdated(chatId);
            }
        }
    }

    private MessageResponse toResponse(
            ChatMessage message,
            UserAccount sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo
    ) {
        MessageStatusResponse status = message.getSenderId().equals(currentUserId)
                ? summary.toResponse()
                : null;

        return new MessageResponse(
                message.getId(),
                message.getChatId(),
                authService.toParticipant(sender),
                message.getCreatedAt(),
                message.getEditedAt(),
                status,
                clientMessageId,
                replyTo,
                reactions,
                toEncryptedPayload(message, currentUserId)
        );
    }

    private Map<UUID, List<MessageReactionSummaryResponse>> loadReactionSummaries(
            Collection<UUID> messageIds,
            UUID currentUserId
    ) {
        List<UUID> ids = sanitizeMessageIds(messageIds);
        if (ids.isEmpty()) {
            return Map.of();
        }

        Map<UUID, List<MessageReaction>> reactionsByMessageId = messageReactionRepository.findAllByMessageIdIn(ids)
                .stream()
                .collect(Collectors.groupingBy(MessageReaction::getMessageId));

        return ids.stream().collect(Collectors.toMap(
                Function.identity(),
                messageId -> summarizeReactions(reactionsByMessageId.getOrDefault(messageId, List.of()), currentUserId)
        ));
    }

    private List<MessageReactionSummaryResponse> summarizeReactions(
            Collection<MessageReaction> reactions,
            UUID currentUserId
    ) {
        if (reactions.isEmpty()) {
            return List.of();
        }

        Map<String, List<MessageReaction>> reactionsByKey = reactions.stream()
                .collect(Collectors.groupingBy(MessageReaction::getReactionKey));

        return REACTION_KEYS.stream()
                .map(key -> {
                    List<MessageReaction> reactionsForKey = reactionsByKey.getOrDefault(key, List.of());
                    if (reactionsForKey.isEmpty()) {
                        return null;
                    }

                    boolean reactedByCurrentUser = reactionsForKey.stream()
                            .anyMatch(reaction -> reaction.getUserId().equals(currentUserId));
                    return new MessageReactionSummaryResponse(key, reactionsForKey.size(), reactedByCurrentUser);
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private MessageReactionEventResponse buildReactionEvent(UUID messageId, UUID chatId, UUID currentUserId) {
        return new MessageReactionEventResponse(
                messageId,
                chatId,
                loadReactionSummaries(List.of(messageId), currentUserId).getOrDefault(messageId, List.of())
        );
    }

    private List<UUID> extractIncomingMessageIds(List<ChatMessage> messages, UUID currentUserId) {
        return messages.stream()
                .filter(message -> !message.getSenderId().equals(currentUserId))
                .map(ChatMessage::getId)
                .toList();
    }

    private Map<UUID, MessageReceiptSummary> loadReceiptSummaries(Collection<UUID> messageIds) {
        List<UUID> ids = sanitizeMessageIds(messageIds);
        if (ids.isEmpty()) {
            return Map.of();
        }

        return messageReceiptRepository.findAllByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(MessageReceipt::getMessageId))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> summarizeReceipts(entry.getValue())));
    }

    private void notifyMessageStatusChanged(Collection<UUID> rawMessageIds) {
        List<UUID> messageIds = sanitizeMessageIds(rawMessageIds);
        if (messageIds.isEmpty()) {
            return;
        }

        Map<UUID, ChatMessage> messagesById = chatMessageRepository.findAllById(messageIds).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        Map<UUID, MessageReceiptSummary> summariesByMessageId = loadReceiptSummaries(messageIds);
        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(
                messagesById.values().stream().map(ChatMessage::getSenderId).toList()
        ).stream().collect(Collectors.toMap(UserAccount::getId, Function.identity()));

        for (UUID messageId : messageIds) {
            ChatMessage message = messagesById.get(messageId);
            if (message == null) {
                continue;
            }

            UserAccount sender = usersById.get(message.getSenderId());
            if (sender == null) {
                continue;
            }

            messagingTemplate.convertAndSendToUser(
                    sender.getUsername(),
                    "/queue/message-statuses",
                    new MessageStatusEventResponse(
                            message.getId(),
                            message.getChatId(),
                            summariesByMessageId.getOrDefault(message.getId(), MessageReceiptSummary.empty()).toResponse()
                    )
            );
        }
    }

    private List<UUID> sanitizeMessageIds(Collection<UUID> rawMessageIds) {
        if (rawMessageIds == null || rawMessageIds.isEmpty()) {
            return List.of();
        }

        return rawMessageIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private MessageReceiptSummary summarizeReceipts(Collection<MessageReceipt> receipts) {
        int recipientCount = receipts.size();
        int deliveredCount = (int) receipts.stream().filter(receipt -> receipt.getDeliveredAt() != null).count();
        int readCount = (int) receipts.stream().filter(receipt -> receipt.getReadAt() != null).count();
        return new MessageReceiptSummary(recipientCount, deliveredCount, readCount);
    }

    private String normalizeClientMessageId(String clientMessageId) {
        if (clientMessageId == null || clientMessageId.isBlank()) {
            return null;
        }

        return clientMessageId;
    }

    private UUID validateReplyTarget(UUID chatId, UUID replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        ChatMessage replyTarget = chatMessageRepository.findById(replyToMessageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply target not found"));
        if (!replyTarget.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply target must belong to the same chat");
        }

        return replyTarget.getId();
    }

    private String normalizeReactionKey(String reactionKey) {
        if (reactionKey == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reaction key is required");
        }

        String normalized = reactionKey.trim().toUpperCase(java.util.Locale.ROOT);
        if (!REACTION_KEYS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported reaction");
        }

        return normalized;
    }

    private DeleteScope parseDeleteScope(String rawScope) {
        if (rawScope == null || rawScope.isBlank()) {
            return DeleteScope.EVERYONE;
        }

        try {
            return DeleteScope.valueOf(rawScope.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported delete scope");
        }
    }

    private Map<String, String> validateEncryptedPayload(
            EncryptedMessagePayloadRequest payload,
            List<UserAccount> participants
    ) {
        if (payload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload is incomplete");
        }
        if (payload.ciphertext().isBlank() || payload.iv().isBlank() || payload.scheme().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload is incomplete");
        }

        Map<String, String> encryptedKeysByUserId = payload.encryptedKeysByUserId();
        if (encryptedKeysByUserId == null || encryptedKeysByUserId.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload keys are required");
        }

        Set<String> expectedUserIds = participants.stream()
                .map(UserAccount::getId)
                .map(UUID::toString)
                .collect(Collectors.toSet());

        if (!encryptedKeysByUserId.keySet().containsAll(expectedUserIds)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted payload must include wrapped keys for all chat participants"
            );
        }

        return encryptedKeysByUserId.entrySet().stream()
                .filter(entry -> entry.getKey() != null && !entry.getKey().isBlank())
                .filter(entry -> entry.getValue() != null && !entry.getValue().isBlank())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private String serializeEncryptedKeys(Map<String, String> encryptedKeysByUserId) {
        try {
            return objectMapper.writeValueAsString(encryptedKeysByUserId);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize encrypted message keys", exception);
        }
    }

    private Map<String, String> deserializeEncryptedKeys(ChatMessage message) {
        if (message.getEncryptedKeysJson() == null || message.getEncryptedKeysJson().isBlank()) {
            return Map.of();
        }

        try {
            return objectMapper.readValue(message.getEncryptedKeysJson(), new TypeReference<Map<String, String>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize encrypted message keys", exception);
        }
    }

    private EncryptedMessagePayloadResponse toEncryptedPayload(ChatMessage message, UUID currentUserId) {
        if (!message.isEncrypted()) {
            throw new IllegalStateException("Plaintext messages are not supported by the encrypted message API");
        }

        String encryptedKey = deserializeEncryptedKeys(message).get(currentUserId.toString());
        if (encryptedKey == null || encryptedKey.isBlank()) {
            throw new IllegalStateException("Encrypted message key is missing for recipient " + currentUserId);
        }

        return new EncryptedMessagePayloadResponse(
                message.getEncryptionScheme(),
                message.getContent(),
                message.getEncryptionIv(),
                encryptedKey
        );
    }

    private String summarizeMessagePreview(ChatMessage message) {
        return message.getEncryptionScheme() != null && !message.getEncryptionScheme().isBlank()
                ? "Encrypted message"
                : message.getContent();
    }

    private enum ReceiptUpdateMode {
        DELIVERED,
        READ
    }

    private enum DeleteScope {
        SELF,
        EVERYONE
    }

    private record MessageReceiptSummary(
            int recipientCount,
            int deliveredCount,
            int readCount
    ) {
        private static MessageReceiptSummary empty() {
            return new MessageReceiptSummary(0, 0, 0);
        }

        private MessageStatusResponse toResponse() {
            MessageDeliveryState state;
            if (recipientCount == 0) {
                state = MessageDeliveryState.SENT;
            } else if (readCount > 0) {
                state = MessageDeliveryState.READ;
            } else if (deliveredCount > 0) {
                state = MessageDeliveryState.DELIVERED;
            } else {
                state = MessageDeliveryState.SENT;
            }

            return new MessageStatusResponse(state, recipientCount, deliveredCount, readCount);
        }
    }
}
