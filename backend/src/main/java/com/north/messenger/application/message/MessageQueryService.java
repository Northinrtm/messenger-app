package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageQueryService {

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
    List<MessageResponse> listMessages(UUID chatId, String username, Instant before, int limit) {
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

        messageReceiptService.acknowledgeReceipts(
                chatId,
                currentUser,
                messageSupport.extractIncomingMessageIds(recentMessages, currentUser.getId()),
                MessageSupport.ReceiptUpdateMode.DELIVERED
        );

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
        Map<UUID, MessageSnippetResponse> repliesByMessageId = messageSupport.loadReplySnippetsByMessageId(
                recentMessages,
                usersById
        );

        return recentMessages.stream()
                .map(message -> messageSupport.toResponse(
                        message,
                        usersById.get(message.getSenderId()),
                        currentUser.getId(),
                        summariesByMessageId.getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty()),
                        reactionsByMessageId.getOrDefault(message.getId(), List.of()),
                        null,
                        repliesByMessageId.get(message.getId())
                ))
                .toList();
    }
}
