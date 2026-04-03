package com.north.messenger.application.message;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.MessageStatusResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class MessageSupport {

    private static final List<String> REACTION_KEYS = List.of("LIKE", "DISLIKE", "EYES", "OK");

    private final AuthService authService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final ObjectMapper objectMapper;

    MessageSupport(
            AuthService authService,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.objectMapper = objectMapper;
    }

    Map<UUID, MessageSnippetResponse> loadReplySnippetsByMessageId(
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

    MessageResponse findExistingMessageResponse(UUID chatId, UserAccount currentUser, String clientMessageId) {
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

    MessageResponse toResponse(
            ChatMessage message,
            UserAccount sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo
    ) {
        return toResponse(
                message,
                authService.toParticipant(sender),
                currentUserId,
                summary,
                reactions,
                clientMessageId,
                replyTo,
                toEncryptedPayload(message, currentUserId)
        );
    }

    MessageResponse toResponse(
            ChatMessage message,
            ParticipantResponse sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo,
            EncryptedMessagePayloadResponse encryptedPayload
    ) {
        MessageStatusResponse status = message.getSenderId().equals(currentUserId)
                ? summary.toResponse()
                : null;

        return new MessageResponse(
                message.getId(),
                message.getChatId(),
                sender,
                message.getCreatedAt(),
                message.getEditedAt(),
                status,
                clientMessageId,
                replyTo,
                reactions,
                encryptedPayload
        );
    }

    Map<UUID, List<MessageReactionSummaryResponse>> loadReactionSummaries(
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

    List<MessageReactionSummaryResponse> summarizeReactions(
            Collection<MessageReaction> reactions,
            UUID currentUserId
    ) {
        if (reactions.isEmpty()) {
            return List.of();
        }

        Map<String, List<MessageReaction>> reactionsByKey = reactions.stream()
                .collect(Collectors.groupingBy(MessageReaction::getReactionKey));

        return summarizeReactions(reactionsByKey, currentUserId);
    }

    List<MessageReactionSummaryResponse> summarizeReactions(
            Map<String, List<MessageReaction>> reactionsByKey,
            UUID currentUserId
    ) {
        if (reactionsByKey.isEmpty()) {
            return List.of();
        }

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

    MessageReactionEventResponse buildReactionEvent(UUID messageId, UUID chatId, UUID currentUserId) {
        return new MessageReactionEventResponse(
                messageId,
                chatId,
                loadReactionSummaries(List.of(messageId), currentUserId).getOrDefault(messageId, List.of())
        );
    }

    List<UUID> extractIncomingMessageIds(List<ChatMessage> messages, UUID currentUserId) {
        return messages.stream()
                .filter(message -> !message.getSenderId().equals(currentUserId))
                .map(ChatMessage::getId)
                .toList();
    }

    Map<UUID, MessageReceiptSummary> loadReceiptSummaries(Collection<UUID> messageIds) {
        List<UUID> ids = sanitizeMessageIds(messageIds);
        if (ids.isEmpty()) {
            return Map.of();
        }

        return messageReceiptRepository.findAllByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(MessageReceipt::getMessageId))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> summarizeReceipts(entry.getValue())));
    }

    List<UUID> sanitizeMessageIds(Collection<UUID> rawMessageIds) {
        if (rawMessageIds == null || rawMessageIds.isEmpty()) {
            return List.of();
        }

        return rawMessageIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    MessageReceiptSummary summarizeReceipts(Collection<MessageReceipt> receipts) {
        int recipientCount = receipts.size();
        int deliveredCount = (int) receipts.stream().filter(receipt -> receipt.getDeliveredAt() != null).count();
        int readCount = (int) receipts.stream().filter(receipt -> receipt.getReadAt() != null).count();
        return new MessageReceiptSummary(recipientCount, deliveredCount, readCount);
    }

    String normalizeClientMessageId(String clientMessageId) {
        if (clientMessageId == null || clientMessageId.isBlank()) {
            return null;
        }

        return clientMessageId;
    }

    UUID validateReplyTarget(UUID chatId, UUID replyToMessageId) {
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

    String normalizeReactionKey(String reactionKey) {
        if (reactionKey == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reaction key is required");
        }

        String normalized = reactionKey.trim().toUpperCase(java.util.Locale.ROOT);
        if (!REACTION_KEYS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported reaction");
        }

        return normalized;
    }

    DeleteScope parseDeleteScope(String rawScope) {
        if (rawScope == null || rawScope.isBlank()) {
            return DeleteScope.EVERYONE;
        }

        try {
            return DeleteScope.valueOf(rawScope.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported delete scope");
        }
    }

    Map<String, String> validateEncryptedPayload(
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

    String serializeEncryptedKeys(Map<String, String> encryptedKeysByUserId) {
        try {
            return objectMapper.writeValueAsString(encryptedKeysByUserId);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize encrypted message keys", exception);
        }
    }

    Map<String, String> deserializeEncryptedKeys(ChatMessage message) {
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

    EncryptedMessagePayloadResponse toEncryptedPayload(ChatMessage message, UUID currentUserId) {
        return toEncryptedPayload(message, currentUserId, deserializeEncryptedKeys(message));
    }

    EncryptedMessagePayloadResponse toEncryptedPayload(
            ChatMessage message,
            UUID currentUserId,
            Map<String, String> encryptedKeysByUserId
    ) {
        if (!message.isEncrypted()) {
            throw new IllegalStateException("Plaintext messages are not supported by the encrypted message API");
        }

        String encryptedKey = encryptedKeysByUserId.get(currentUserId.toString());
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

    String summarizeMessagePreview(ChatMessage message) {
        return message.getEncryptionScheme() != null && !message.getEncryptionScheme().isBlank()
                ? "Encrypted message"
                : message.getContent();
    }

    enum ReceiptUpdateMode {
        DELIVERED,
        READ
    }

    enum DeleteScope {
        SELF,
        EVERYONE
    }

    record MessageReceiptSummary(
            int recipientCount,
            int deliveredCount,
            int readCount
    ) {
        static MessageReceiptSummary empty() {
            return new MessageReceiptSummary(0, 0, 0);
        }

        MessageStatusResponse toResponse() {
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
