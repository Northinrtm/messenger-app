package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReceiptListResponse;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageStatusEventResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageReceiptService {

    private final AuthService authService;
    private final ChatService chatService;
    private final MessageReceiptRepository messageReceiptRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserAccountRepository userAccountRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final MessageSupport messageSupport;
    private final ApplicationEventPublisher eventPublisher;

    MessageReceiptService(
            AuthService authService,
            ChatService chatService,
            MessageReceiptRepository messageReceiptRepository,
            ChatMessageRepository chatMessageRepository,
            UserAccountRepository userAccountRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            MessageSupport messageSupport,
            ApplicationEventPublisher eventPublisher
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.messageReceiptRepository = messageReceiptRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.userAccountRepository = userAccountRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.messageSupport = messageSupport;
        this.eventPublisher = eventPublisher;
    }

    MessageReceiptListResponse listReceipts(UUID chatId, UUID messageId, String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        List<MessageReceipt> receipts = messageReceiptRepository.findAllByMessageId(messageId);
        if (receipts.isEmpty()) {
            return new MessageReceiptListResponse(List.of());
        }
        Set<UUID> userIds = receipts.stream().map(MessageReceipt::getUserId).collect(Collectors.toSet());
        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(userIds).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
        List<MessageReceiptListResponse.Entry> entries = receipts.stream()
                .filter(r -> !r.getUserId().equals(currentUser.getId()))
                .map(r -> {
                    UserAccount user = usersById.get(r.getUserId());
                    if (user == null) return null;
                    return new MessageReceiptListResponse.Entry(
                            user.getId(), user.getUsername(), user.getDisplayName(),
                            user.getAvatarUrl(), r.getDeliveredAt(), r.getReadAt()
                    );
                })
                .filter(e -> e != null)
                .sorted((a, b) -> {
                    if (a.readAt() != null && b.readAt() != null) return b.readAt().compareTo(a.readAt());
                    if (a.readAt() != null) return -1;
                    if (b.readAt() != null) return 1;
                    if (a.deliveredAt() != null && b.deliveredAt() != null) return b.deliveredAt().compareTo(a.deliveredAt());
                    return 0;
                })
                .toList();
        return new MessageReceiptListResponse(entries);
    }

    @Transactional
    void acknowledgeDelivered(UUID chatId, String username, MessageReceiptRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        acknowledgeReceipts(chatId, currentUser, request.messageIds(), MessageSupport.ReceiptUpdateMode.DELIVERED);
    }

    @Transactional
    void acknowledgeRead(UUID chatId, String username, MessageReceiptRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        acknowledgeReceipts(chatId, currentUser, request.messageIds(), MessageSupport.ReceiptUpdateMode.READ);
    }

    @Transactional
    void acknowledgeReceipts(
            UUID chatId,
            UserAccount currentUser,
            Collection<UUID> rawMessageIds,
            MessageSupport.ReceiptUpdateMode updateMode
    ) {
        List<UUID> messageIds = messageSupport.sanitizeMessageIds(rawMessageIds);
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
            boolean changed = updateMode == MessageSupport.ReceiptUpdateMode.READ
                    ? receipt.markRead(now)
                    : receipt.markDelivered(now);
            if (changed) {
                changedMessageIds.add(receipt.getMessageId());
            }
        }

        if (!changedMessageIds.isEmpty()) {
            eventPublisher.publishEvent(new MessageStatusChangedEvent(
                    chatId,
                    List.copyOf(changedMessageIds),
                    updateMode == MessageSupport.ReceiptUpdateMode.READ
            ));
        }
    }

    void notifyMessageStatusChanged(Collection<UUID> rawMessageIds) {
        List<UUID> messageIds = messageSupport.sanitizeMessageIds(rawMessageIds);
        if (messageIds.isEmpty()) {
            return;
        }

        Map<UUID, ChatMessage> messagesById = chatMessageRepository.findAllById(messageIds).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        Map<UUID, MessageSupport.MessageReceiptSummary> summariesByMessageId = messageSupport.loadReceiptSummaries(messageIds);
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

            realtimeMessagingGateway.sendToUser(
                    sender.getUsername(),
                    "/queue/message-statuses",
                    new MessageStatusEventResponse(
                            message.getId(),
                            message.getChatId(),
                            summariesByMessageId.getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty()).toResponse()
                    )
            );
        }
    }
}
