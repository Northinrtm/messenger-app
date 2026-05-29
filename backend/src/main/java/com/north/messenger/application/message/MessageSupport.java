package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatAttachmentResponse;
import com.north.messenger.api.dto.ForwardedMessageInfoResponse;
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
import com.north.messenger.domain.model.ChatRoomBan;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
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
    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomBanRepository chatRoomBanRepository;
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
            ChatRoomRepository chatRoomRepository,
            ChatRoomBanRepository chatRoomBanRepository,
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
        this.chatRoomRepository = chatRoomRepository;
        this.chatRoomBanRepository = chatRoomBanRepository;
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
        Instant visibleTo = resolveVisibleHistoryEnd(room, membership);

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
                    if (!canViewMessageForReplySnippet(referencedMessage, viewerUserId, visibleFrom, visibleTo)) {
                        return null;
                    }

                    UserAccount sender = usersById.get(referencedMessage.getSenderId());
                    return Map.entry(
                            message.getId(),
                            new MessageSnippetResponse(
                                    referencedMessage.getId(),
                                    sender != null
                                            ? authService.toParticipant(sender)
                                            : authService.toDeletedParticipant(referencedMessage.getSenderId()),
                                    referencedMessage.getCreatedAt(),
                                    messagePreviewService.summarizeMessagePreview(
                                            referencedMessage,
                                            attachmentsByMessageId.getOrDefault(referencedMessage.getId(), List.of())
                                    ),
                                    referencedMessage.getServerOrder()
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
                loadAttachmentResponses(List.of(message.getId())).getOrDefault(message.getId(), List.of()),
                resolveForwardedInfo(message, Map.of(sender.getId(), sender))
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
                attachments,
                resolveForwardedInfo(message, Map.of(sender.getId(), sender))
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
                loadAttachmentResponses(List.of(message.getId())).getOrDefault(message.getId(), List.of()),
                resolveForwardedInfo(message, Map.of(sender.getId(), sender))
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
                attachments,
                resolveForwardedInfo(message, Map.of(sender.getId(), sender))
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
            List<ChatAttachmentResponse> attachments,
            ForwardedMessageInfoResponse forwardedFrom
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
                message.isForwarded(),
                forwardedFrom,
                plainPayload,
                attachments
        );
    }

    Map<UUID, ForwardedMessageInfoResponse> loadForwardedInfosByMessageId(
            Collection<ChatMessage> messages,
            Map<UUID, UserAccount> knownUsersById
    ) {
        List<ChatMessage> forwardedMessages = messages.stream()
                .filter(Objects::nonNull)
                .filter(message -> message.getForwardedFromSenderId() != null)
                .toList();
        if (forwardedMessages.isEmpty()) {
            return Map.of();
        }

        Set<UUID> missingSenderIds = forwardedMessages.stream()
                .map(ChatMessage::getForwardedFromSenderId)
                .filter(Objects::nonNull)
                .filter(senderId -> !knownUsersById.containsKey(senderId))
                .collect(Collectors.toSet());
        Map<UUID, UserAccount> usersById = new HashMap<>(knownUsersById);
        if (!missingSenderIds.isEmpty()) {
            userAccountRepository.findAllByIdIn(missingSenderIds)
                    .forEach(user -> usersById.put(user.getId(), user));
        }

        return forwardedMessages.stream()
                .collect(Collectors.toMap(
                        ChatMessage::getId,
                        message -> buildForwardedInfo(message, usersById)
                ));
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
        Instant visibleTo = resolveVisibleHistoryEnd(room, membership);
        if (!canViewMessageForReplySnippet(replyTarget, currentUser.getId(), visibleFrom, visibleTo)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply target not found");
        }

        return replyTarget.getId();
    }

    ForwardedMessageContext validateForwardTarget(UserAccount currentUser, UUID forwardedFromMessageId) {
        if (forwardedFromMessageId == null) {
            return null;
        }

        ChatMessage sourceMessage = chatMessageRepository.findById(forwardedFromMessageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Forward source not found"));
        ChatRoom sourceRoom = chatRoomRepository.findById(sourceMessage.getChatId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Forward source not found"));
        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(sourceRoom.getId(), currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Forward source not found"));
        if (!sourceRoom.isDirect() && chatRoomBanRepository.existsByChatIdAndUserId(sourceRoom.getId(), currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Forward source not found");
        }
        Instant visibleFrom = resolveVisibleHistoryStart(sourceRoom, membership);
        Instant visibleTo = resolveVisibleHistoryEnd(sourceRoom, membership);
        if (!canViewMessageForReplySnippet(sourceMessage, currentUser.getId(), visibleFrom, visibleTo)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Forward source not found");
        }

        UUID originalSenderId = sourceMessage.getForwardedFromSenderId() != null
                ? sourceMessage.getForwardedFromSenderId()
                : sourceMessage.getSenderId();
        return new ForwardedMessageContext(sourceMessage, originalSenderId);
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

    private boolean canViewMessageForReplySnippet(
            ChatMessage message,
            UUID viewerUserId,
            Instant visibleFrom,
            Instant visibleTo
    ) {
        if (userDeletedMessageRepository.existsByUserIdAndMessageId(viewerUserId, message.getId())) {
            return false;
        }
        if (visibleFrom != null && message.getCreatedAt().isBefore(visibleFrom)) {
            return false;
        }
        return visibleTo == null || !message.getCreatedAt().isAfter(visibleTo);
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect()) {
            return membership.getJoinedAt();
        }
        if (room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    private Instant resolveVisibleHistoryEnd(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect() || membership == null) {
            return null;
        }

        Instant visibleTo = membership.getLeftAt();
        ChatRoomBan ban = chatRoomBanRepository.findByChatIdAndUserId(room.getId(), membership.getUserId()).orElse(null);
        if (ban == null) {
            return visibleTo;
        }
        if (visibleTo == null) {
            return ban.getCreatedAt();
        }
        return visibleTo.isBefore(ban.getCreatedAt()) ? visibleTo : ban.getCreatedAt();
    }

    PlainMessagePayloadResponse toPlainPayload(ChatMessage message) {
        if (message == null) {
            return null;
        }
        return new PlainMessagePayloadResponse(messageContentCryptoService.requirePlainContent(message));
    }

    private ForwardedMessageInfoResponse resolveForwardedInfo(
            ChatMessage message,
            Map<UUID, UserAccount> knownUsersById
    ) {
        if (message == null || message.getForwardedFromSenderId() == null) {
            return null;
        }
        return buildForwardedInfo(message, knownUsersById);
    }

    private ForwardedMessageInfoResponse buildForwardedInfo(
            ChatMessage message,
            Map<UUID, UserAccount> knownUsersById
    ) {
        UUID forwardedFromSenderId = message.getForwardedFromSenderId();
        if (forwardedFromSenderId == null) {
            return null;
        }

        UserAccount sender = knownUsersById.get(forwardedFromSenderId);
        if (sender == null) {
            sender = userAccountRepository.findById(forwardedFromSenderId).orElse(null);
        }

        return new ForwardedMessageInfoResponse(
                sender != null
                        ? authService.toParticipant(sender)
                        : authService.toDeletedParticipant(forwardedFromSenderId)
        );
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

    record ForwardedMessageContext(
            ChatMessage sourceMessage,
            UUID originalSenderId
    ) {
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

