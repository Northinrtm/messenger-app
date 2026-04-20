package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageQueryService {

    private static final Logger log = LoggerFactory.getLogger(MessageQueryService.class);

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final UserAccountRepository userAccountRepository;
    private final MessageReceiptService messageReceiptService;
    private final MessageSupport messageSupport;

    MessageQueryService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            UserAccountRepository userAccountRepository,
            MessageReceiptService messageReceiptService,
            MessageSupport messageSupport
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.userAccountRepository = userAccountRepository;
        this.messageReceiptService = messageReceiptService;
        this.messageSupport = messageSupport;
    }

    @Transactional
    List<MessageResponse> listMessages(
            UUID chatId,
            String username,
            Long beforeServerOrder,
            int limit,
            boolean acknowledgeDelivered
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageRequest = PageRequest.of(0, safeLimit);
        List<ChatMessage> recentMessages = new ArrayList<>(
                beforeServerOrder == null
                        ? chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(
                                chatId,
                                currentUser.getId(),
                                pageRequest
                        )
                        : chatMessageRepository.findVisibleEncryptedByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
                                chatId,
                                beforeServerOrder,
                                currentUser.getId(),
                                pageRequest
                        )
        );
        recentMessages.sort(MessageQueryService::compareMessageOrder);

        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(
                        recentMessages.stream().map(ChatMessage::getSenderId).toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
        Map<UUID, MessageSupport.MessageReceiptSummary> summariesByMessageId = messageSupport.loadReceiptSummaries(
                recentMessages.stream().map(ChatMessage::getId).toList()
        );
        Map<UUID, List<MessageReactionSummaryResponse>> reactionsByMessageId = messageSupport.loadReactionSummaries(
                recentMessages.stream().map(ChatMessage::getId).toList(),
                currentUser.getId()
        );
        Set<String> visibleCurrentUserDeviceIds = recentMessages.isEmpty()
                ? Set.of()
                : messageSupport.loadVisibleDeviceIds(currentUser.getId());
        Map<UUID, MessageSnippetResponse> repliesByMessageId = messageSupport.loadReplySnippetsByMessageId(
                recentMessages,
                usersById
        );

        List<RenderedMessage> renderedMessages = recentMessages.stream()
                .map(message -> tryRenderMessage(
                        chatId,
                        currentUser,
                        message,
                        usersById,
                        summariesByMessageId,
                        reactionsByMessageId,
                        visibleCurrentUserDeviceIds,
                        repliesByMessageId
                ))
                .flatMap(Optional::stream)
                .toList();

        if (acknowledgeDelivered) {
            messageReceiptService.acknowledgeReceipts(
                    chatId,
                    currentUser,
                    messageSupport.extractIncomingMessageIds(
                            renderedMessages.stream().map(RenderedMessage::message).toList(),
                            currentUser.getId()
                    ),
                    MessageSupport.ReceiptUpdateMode.DELIVERED
            );
        }

        return renderedMessages.stream().map(RenderedMessage::response).toList();
    }

    private static int compareMessageOrder(ChatMessage left, ChatMessage right) {
        return Long.compare(left.getServerOrder(), right.getServerOrder());
    }

    private Optional<RenderedMessage> tryRenderMessage(
            UUID chatId,
            UserAccount currentUser,
            ChatMessage message,
            Map<UUID, UserAccount> usersById,
            Map<UUID, MessageSupport.MessageReceiptSummary> summariesByMessageId,
            Map<UUID, List<MessageReactionSummaryResponse>> reactionsByMessageId,
            Set<String> visibleCurrentUserDeviceIds,
            Map<UUID, MessageSnippetResponse> repliesByMessageId
    ) {
        UserAccount sender = usersById.get(message.getSenderId());
        if (sender == null) {
            log.warn(
                    "Skipping chat message with missing sender chatId={} messageId={} senderId={} currentUserId={}",
                    chatId,
                    message.getId(),
                    message.getSenderId(),
                    currentUser.getId()
            );
            return Optional.empty();
        }

        try {
            EncryptedMessagePayloadResponse encryptedPayload = messageSupport.toEncryptedPayload(
                    message,
                    currentUser.getId(),
                    messageSupport.deserializeEncryptedKeys(message),
                    visibleCurrentUserDeviceIds
            );
            return Optional.of(new RenderedMessage(
                    message,
                    messageSupport.toResponse(
                            message,
                            authService.toParticipant(sender),
                            currentUser.getId(),
                            summariesByMessageId.getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty()),
                            reactionsByMessageId.getOrDefault(message.getId(), List.of()),
                            message.getSenderId().equals(currentUser.getId()) ? message.getClientMessageId() : null,
                            repliesByMessageId.get(message.getId()),
                            encryptedPayload
                    )
            ));
        } catch (IllegalStateException exception) {
            log.warn(
                    "Skipping malformed chat message chatId={} messageId={} senderId={} currentUserId={} reason={}",
                    chatId,
                    message.getId(),
                    message.getSenderId(),
                    currentUser.getId(),
                    exception.getMessage()
            );
            return Optional.empty();
        }
    }

    private record RenderedMessage(
            ChatMessage message,
            MessageResponse response
    ) {
    }
}
