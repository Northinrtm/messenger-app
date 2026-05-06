package com.north.messenger.application.message;

import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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
    private final ChatParticipantRepository chatParticipantRepository;
    private final UserAccountRepository userAccountRepository;
    private final MessageReceiptService messageReceiptService;
    private final MessageSupport messageSupport;

    MessageQueryService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            ChatParticipantRepository chatParticipantRepository,
            UserAccountRepository userAccountRepository,
            MessageReceiptService messageReceiptService,
            MessageSupport messageSupport
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.chatParticipantRepository = chatParticipantRepository;
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
        return listMessagePage(chatId, username, beforeServerOrder, limit, acknowledgeDelivered).messages();
    }

    @Transactional
    MessagePageResponse listMessagePage(
            UUID chatId,
            String username,
            String cursor,
            int limit,
            boolean acknowledgeDelivered
    ) {
        return listMessagePage(
                chatId,
                username,
                parseCursor(cursor),
                limit,
                acknowledgeDelivered
        );
    }

    private MessagePageResponse listMessagePage(
            UUID chatId,
            String username,
            Long beforeServerOrder,
            int limit,
            boolean acknowledgeDelivered
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.FORBIDDEN,
                        "Access denied for this chat"
                ));
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageRequest = PageRequest.of(0, safeLimit);
        List<ChatMessage> recentMessages = new ArrayList<>(
                beforeServerOrder == null
                        ? chatMessageRepository.findVisibleEncryptedByChatIdOrderByServerOrderDesc(
                                chatId,
                                currentUser.getId(),
                                pageRequest
                        )
                        : visibleFrom == null
                                ? chatMessageRepository.findVisibleEncryptedByChatIdAndServerOrderBeforeOrderByServerOrderDesc(
                                        chatId,
                                        beforeServerOrder,
                                        currentUser.getId(),
                                        pageRequest
                                )
                                : chatMessageRepository.findVisibleEncryptedByChatIdAndServerOrderBeforeAndCreatedAtAfterOrderByServerOrderDesc(
                                        chatId,
                                        beforeServerOrder,
                                        currentUser.getId(),
                                        visibleFrom,
                                        pageRequest
                                )
        );
        if (visibleFrom != null && beforeServerOrder == null) {
            recentMessages = new ArrayList<>(
                    chatMessageRepository.findVisibleEncryptedByChatIdAndCreatedAtAfterOrderByServerOrderDesc(
                            chatId,
                            currentUser.getId(),
                            visibleFrom,
                            pageRequest
                    )
            );
        }
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
        Map<UUID, MessageSnippetResponse> repliesByMessageId = messageSupport.loadReplySnippetsByMessageId(
                recentMessages,
                usersById,
                room,
                currentUser.getId()
        );

        List<RenderedMessage> renderedMessages = recentMessages.stream()
                .map(message -> tryRenderMessage(
                        chatId,
                        currentUser,
                    message,
                    usersById,
                    summariesByMessageId,
                    reactionsByMessageId,
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

        List<MessageResponse> responses = renderedMessages.stream().map(RenderedMessage::response).toList();
        String nextCursor = recentMessages.size() == safeLimit && !recentMessages.isEmpty()
                ? Long.toString(recentMessages.get(0).getServerOrder())
                : null;
        List<String> confirmedPendingOutgoingClientMessageIds = responses.stream()
                .map(MessageResponse::clientMessageId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        return new MessagePageResponse(
                responses,
                nextCursor,
                confirmedPendingOutgoingClientMessageIds
        );
    }

    private Long parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }

        try {
            return Long.parseLong(cursor.trim());
        } catch (NumberFormatException exception) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Message page cursor is malformed"
            );
        }
    }

    private static int compareMessageOrder(ChatMessage left, ChatMessage right) {
        return Long.compare(left.getServerOrder(), right.getServerOrder());
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect()
                || room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    private Optional<RenderedMessage> tryRenderMessage(
            UUID chatId,
            UserAccount currentUser,
            ChatMessage message,
            Map<UUID, UserAccount> usersById,
            Map<UUID, MessageSupport.MessageReceiptSummary> summariesByMessageId,
            Map<UUID, List<MessageReactionSummaryResponse>> reactionsByMessageId,
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

        ParticipantResponse senderParticipant = authService.toParticipant(sender);
        EncryptedMessagePayloadResponse encryptedPayload = messageSupport.toEncryptedPayload(message);

        return Optional.of(new RenderedMessage(
                message,
                messageSupport.toResponse(
                        message,
                        senderParticipant,
                        currentUser.getId(),
                        summariesByMessageId.getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty()),
                        reactionsByMessageId.getOrDefault(message.getId(), List.of()),
                        message.getSenderId().equals(currentUser.getId()) ? message.getClientMessageId() : null,
                        repliesByMessageId.get(message.getId()),
                        encryptedPayload
                )
        ));
    }

    private record RenderedMessage(
            ChatMessage message,
            MessageResponse response
    ) {
    }
}
