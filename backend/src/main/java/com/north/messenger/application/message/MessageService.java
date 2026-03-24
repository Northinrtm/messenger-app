package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageStatusEventResponse;
import com.north.messenger.api.dto.MessageStatusResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class MessageService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final UserAccountRepository userAccountRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public List<MessageResponse> listMessages(UUID chatId, String username, Instant before, int limit) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageRequest = PageRequest.of(0, safeLimit);
        List<ChatMessage> recentMessages = new ArrayList<>(
                before == null
                        ? chatMessageRepository.findByChatIdOrderByCreatedAtDesc(chatId, pageRequest)
                        : chatMessageRepository.findByChatIdAndCreatedAtBeforeOrderByCreatedAtDesc(chatId, before, pageRequest)
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

        return recentMessages.stream()
                .map(message -> toResponse(
                        message,
                        usersById.get(message.getSenderId()),
                        currentUser.getId(),
                        summariesByMessageId.getOrDefault(message.getId(), MessageReceiptSummary.empty())
                ))
                .toList();
    }

    @Transactional
    public MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        String content = request.content().trim();
        if (content.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message content cannot be blank");
        }

        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                content,
                Instant.now()
        );
        chatMessageRepository.save(message);

        List<UserAccount> participants = chatService.findParticipants(chatId);
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

        MessageReceiptSummary summary = summarizeReceipts(receipts);
        MessageResponse responseForSender = toResponse(message, currentUser, currentUser.getId(), summary);
        chatService.notifyChatUpdated(chatId);

        participants.forEach(participant -> {
            MessageResponse response = participant.getId().equals(currentUser.getId())
                    ? responseForSender
                    : toResponse(message, currentUser, participant.getId(), summary);
            messagingTemplate.convertAndSendToUser(participant.getUsername(), "/queue/messages", response);
        });
        return responseForSender;
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
            MessageReceiptSummary summary
    ) {
        MessageStatusResponse status = message.getSenderId().equals(currentUserId)
                ? summary.toResponse()
                : null;

        return new MessageResponse(
                message.getId(),
                message.getChatId(),
                authService.toParticipant(sender),
                message.getContent(),
                message.getCreatedAt(),
                status
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

    private enum ReceiptUpdateMode {
        DELIVERED,
        READ
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
