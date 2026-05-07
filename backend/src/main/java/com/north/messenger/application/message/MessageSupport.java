package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatAttachmentResponse;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.MessageStatusResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.PlainMessagePayloadRequest;
import com.north.messenger.api.dto.PlainMessagePayloadResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
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
    private final ChatAttachmentRepository chatAttachmentRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserDeletedMessageRepository userDeletedMessageRepository;
    private final MessagePreviewService messagePreviewService;
    private final MessageContentCryptoService messageContentCryptoService;

    MessageSupport(
            AuthService authService,
            ChatAttachmentRepository chatAttachmentRepository,
            ChatMessageRepository chatMessageRepository,
            ChatParticipantRepository chatParticipantRepository,
            MessageReceiptRepository messageReceiptRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            MessagePreviewService messagePreviewService,
            MessageContentCryptoService messageContentCryptoService
    ) {
        this.authService = authService;
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.messagePreviewService = messagePreviewService;
        this.messageContentCryptoService = messageContentCryptoService;
    }

    Map<UUID, MessageSnippetResponse> loadReplySnippetsByMessageId(
            Collection<ChatMessage> messages,
            Map<UUID, UserAccount> knownUsersById,
            ChatRoom room,
            UUID viewerUserId
    ) {
        List<ChatMessage> messagesWithReply = messages.stream()
                .filter(message -> message.getReplyToMessageId() != null)
                .toList();
        if (messagesWithReply.isEmpty()) {
            return Map.of();
        }
        if (room == null || viewerUserId == null) {
            return Map.of();
        }

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(room.getId(), viewerUserId)
                .orElse(null);
        if (membership == null) {
            return Map.of();
        }
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);

        Map<UUID, ChatMessage> referencedMessagesById = chatMessageRepository.findAllById(
                        messagesWithReply.stream().map(ChatMessage::getReplyToMessageId).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        if (referencedMessagesById.isEmpty()) {
            return Map.of();
        }
        messageContentCryptoService.hydrateContents(referencedMessagesById.values());
        Map<UUID, List<ChatAttachment>> attachmentsByMessageId = chatAttachmentRepository
                .findAllByMessageIdInOrderByCreatedAtAsc(referencedMessagesById.keySet())
                .stream()
                .filter(attachment -> attachment.getMessageId() != null)
                .collect(Collectors.groupingBy(ChatAttachment::getMessageId));

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
                    if (!canViewMessageForReplySnippet(referencedMessage, viewerUserId, visibleFrom)) {
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
                                    messagePreviewService.summarizeMessagePreview(
                                            referencedMessage,
                                            attachmentsByMessageId.getOrDefault(referencedMessage.getId(), List.of())
                                    )
                            )
                    );
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    MessageResponse findExistingMessageResponse(ChatRoom room, UserAccount currentUser, String clientMessageId) {
        if (clientMessageId == null) {
            return null;
        }

        ChatMessage existingMessage = chatMessageRepository
                .findByChatIdAndSenderIdAndClientMessageId(room.getId(), currentUser.getId(), clientMessageId)
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
        List<ChatAttachmentResponse> attachments = loadAttachmentResponses(List.of(existingMessage.getId()))
                .getOrDefault(existingMessage.getId(), List.of());
        return toResponse(
                existingMessage,
                currentUser,
                currentUser.getId(),
                summary,
                reactions,
                existingMessage.getClientMessageId(),
                loadReplySnippetsByMessageId(
                        List.of(existingMessage),
                        Map.of(currentUser.getId(), currentUser),
                        room,
                        currentUser.getId()
                )
                        .get(existingMessage.getId()),
                attachments
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
                toPlainPayload(message),
                loadAttachmentResponses(List.of(message.getId())).getOrDefault(message.getId(), List.of())
        );
    }

    MessageResponse toResponse(
            ChatMessage message,
            UserAccount sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo,
            List<ChatAttachmentResponse> attachments
    ) {
        return toResponse(
                message,
                authService.toParticipant(sender),
                currentUserId,
                summary,
                reactions,
                clientMessageId,
                replyTo,
                toPlainPayload(message),
                attachments
        );
    }

    MessageResponse toResponse(
            ChatMessage message,
            UserAccount sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo,
            PlainMessagePayloadResponse plainPayload
    ) {
        return toResponse(
                message,
                authService.toParticipant(sender),
                currentUserId,
                summary,
                reactions,
                clientMessageId,
                replyTo,
                plainPayload,
                loadAttachmentResponses(List.of(message.getId())).getOrDefault(message.getId(), List.of())
        );
    }

    MessageResponse toResponse(
            ChatMessage message,
            UserAccount sender,
            UUID currentUserId,
            MessageReceiptSummary summary,
            List<MessageReactionSummaryResponse> reactions,
            String clientMessageId,
            MessageSnippetResponse replyTo,
            PlainMessagePayloadResponse plainPayload,
            List<ChatAttachmentResponse> attachments
    ) {
        return toResponse(
                message,
                authService.toParticipant(sender),
                currentUserId,
                summary,
                reactions,
                clientMessageId,
                replyTo,
                plainPayload,
                attachments
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
            PlainMessagePayloadResponse plainPayload,
            List<ChatAttachmentResponse> attachments
    ) {
        MessageStatusResponse status = message.getSenderId().equals(currentUserId)
                ? summary.toResponse()
                : null;

        return new MessageResponse(
                message.getId(),
                message.getChatId(),
                message.getServerOrder(),
                sender,
                message.getCreatedAt(),
                message.getEditedAt(),
                status,
                clientMessageId,
                replyTo,
                reactions,
                plainPayload,
                attachments
        );
    }

    String validatePlainPayload(PlainMessagePayloadRequest payload, boolean attachmentsPresent) {
        if (payload == null || payload.content() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message payload is incomplete");
        }
        String normalized = payload.content().trim();
        if (normalized.isEmpty() && !attachmentsPresent) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message payload is incomplete");
        }
        return normalized;
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

    Map<UUID, List<ChatAttachmentResponse>> loadAttachmentResponses(Collection<UUID> messageIds) {
        List<UUID> ids = sanitizeMessageIds(messageIds);
        if (ids.isEmpty()) {
            return Map.of();
        }

        Map<UUID, List<ChatAttachmentResponse>> attachmentsByMessageId = chatAttachmentRepository
                .findAllByMessageIdInOrderByCreatedAtAsc(ids)
                .stream()
                .filter(attachment -> attachment.getMessageId() != null)
                .collect(Collectors.groupingBy(
                        ChatAttachment::getMessageId,
                        Collectors.mapping(this::toAttachmentResponse, Collectors.toList())
                ));

        return ids.stream().collect(Collectors.toMap(
                Function.identity(),
                messageId -> attachmentsByMessageId.getOrDefault(messageId, List.of())
        ));
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
        if (clientMessageId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client message id is required");
        }

        String normalized = clientMessageId.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client message id is required");
        }

        return normalized;
    }

    UUID validateReplyTarget(ChatRoom room, UserAccount currentUser, UUID replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(room.getId(), currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Access denied for this chat"
                ));
        ChatMessage replyTarget = chatMessageRepository.findById(replyToMessageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply target not found"));
        if (!replyTarget.getChatId().equals(room.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply target must belong to the same chat");
        }
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);
        if (!canViewMessageForReplySnippet(replyTarget, currentUser.getId(), visibleFrom)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply target not found");
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

    private boolean canViewMessageForReplySnippet(ChatMessage message, UUID viewerUserId, Instant visibleFrom) {
        if (userDeletedMessageRepository.existsByUserIdAndMessageId(viewerUserId, message.getId())) {
            return false;
        }
        return visibleFrom == null || !message.getCreatedAt().isBefore(visibleFrom);
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect()
                || room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    PlainMessagePayloadResponse toPlainPayload(ChatMessage message) {
        if (message == null) {
            return null;
        }
        return new PlainMessagePayloadResponse(messageContentCryptoService.requirePlainContent(message));
    }

    String summarizeMessagePreview(ChatMessage message) {
        return messagePreviewService.summarizeMessagePreview(message);
    }

    private ChatAttachmentResponse toAttachmentResponse(ChatAttachment attachment) {
        return new ChatAttachmentResponse(
                attachment.getId(),
                attachment.getFileName(),
                attachment.getMimeType(),
                attachment.getSizeBytes()
        );
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

