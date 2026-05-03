package com.north.messenger.application.message;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.PendingOutgoingMessageAttachmentPayload;
import com.north.messenger.api.dto.PendingOutgoingMessageResponse;
import com.north.messenger.api.dto.UpsertPendingOutgoingMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.PendingOutgoingMessageStatus;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.model.UserPendingOutgoingMessage;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserPendingOutgoingMessageRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class PendingOutgoingMessageService {

    private static final TypeReference<List<PendingOutgoingMessageAttachmentPayload>> ATTACHMENTS_TYPE =
            new TypeReference<>() { };

    private final AuthService authService;
    private final ChatService chatService;
    private final UserDeletedChatRepository userDeletedChatRepository;
    private final UserPendingOutgoingMessageRepository userPendingOutgoingMessageRepository;
    private final ObjectMapper objectMapper;

    public PendingOutgoingMessageService(
            AuthService authService,
            ChatService chatService,
            UserDeletedChatRepository userDeletedChatRepository,
            UserPendingOutgoingMessageRepository userPendingOutgoingMessageRepository,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.userDeletedChatRepository = userDeletedChatRepository;
        this.userPendingOutgoingMessageRepository = userPendingOutgoingMessageRepository;
        this.objectMapper = objectMapper;
    }

    public List<PendingOutgoingMessageResponse> listOwnPendingOutgoingMessages(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        return userPendingOutgoingMessageRepository.findVisibleByUserIdOrderByCreatedAtAsc(currentUser.getId())
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public PendingOutgoingMessageResponse upsertOwnPendingOutgoingMessage(
            String username,
            String rawClientMessageId,
            UpsertPendingOutgoingMessageRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        String clientMessageId = normalizeClientMessageId(rawClientMessageId);
        requireVisibleChatMembership(request.chatId(), currentUser);
        PendingOutgoingMessageStatus status = parseStatus(request.status());
        Instant now = Instant.now();
        Instant createdAt = request.createdAt() == null ? now : request.createdAt();
        String attachmentsPayloadJson = serializeAttachments(request.attachments());
        String replyToPayloadJson = serializeReplyTo(request.replyTo());

        UserPendingOutgoingMessage pendingMessage = userPendingOutgoingMessageRepository
                .findByUserIdAndClientMessageId(currentUser.getId(), clientMessageId)
                .map(existing -> {
                    if (!existing.getChatId().equals(request.chatId())) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Pending message already belongs to a different chat"
                        );
                    }
                    existing.update(
                            request.chatId(),
                            request.content(),
                            createdAt,
                            request.localOrder(),
                            request.recipientCount(),
                            replyToPayloadJson,
                            status,
                            attachmentsPayloadJson,
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserPendingOutgoingMessage(
                        UUID.randomUUID(),
                        currentUser.getId(),
                        request.chatId(),
                        clientMessageId,
                        request.content(),
                        createdAt,
                        request.localOrder(),
                        request.recipientCount(),
                        replyToPayloadJson,
                        status,
                        attachmentsPayloadJson,
                        now
                ));

        userPendingOutgoingMessageRepository.save(pendingMessage);
        return toResponse(pendingMessage);
    }

    @Transactional
    public void deleteOwnPendingOutgoingMessage(String username, String rawClientMessageId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        deleteByUserIdAndClientMessageId(currentUser.getId(), rawClientMessageId);
    }

    @Transactional
    public void deleteByUserIdAndClientMessageId(UUID userId, String rawClientMessageId) {
        if (userId == null) {
            return;
        }
        String clientMessageId = normalizeClientMessageId(rawClientMessageId);
        userPendingOutgoingMessageRepository.deleteByUserIdAndClientMessageId(userId, clientMessageId);
    }

    private void requireVisibleChatMembership(UUID chatId, UserAccount currentUser) {
        chatService.requireChatMembership(chatId, currentUser);
        UserDeletedChat deletedChat = userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                .orElse(null);
        if (deletedChat != null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found");
        }
    }

    private PendingOutgoingMessageResponse toResponse(UserPendingOutgoingMessage pendingMessage) {
        return new PendingOutgoingMessageResponse(
                pendingMessage.getChatId(),
                pendingMessage.getClientMessageId(),
                pendingMessage.getContent(),
                pendingMessage.getCreatedAt(),
                pendingMessage.getLocalOrder(),
                pendingMessage.getRecipientCount(),
                deserializeReplyTo(pendingMessage.getReplyToPayloadJson()),
                pendingMessage.getStatus().name(),
                pendingMessage.getUpdatedAt(),
                deserializeAttachments(pendingMessage.getAttachmentsPayloadJson())
        );
    }

    private PendingOutgoingMessageStatus parseStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pending message status is required");
        }
        try {
            return PendingOutgoingMessageStatus.valueOf(rawStatus.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pending message status is invalid");
        }
    }

    private String normalizeClientMessageId(String rawClientMessageId) {
        if (rawClientMessageId == null || rawClientMessageId.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client message id is required");
        }
        return rawClientMessageId.trim();
    }

    private String serializeReplyTo(MessageSnippetResponse replyTo) {
        if (replyTo == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(replyTo);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pending message reply is invalid");
        }
    }

    private MessageSnippetResponse deserializeReplyTo(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(payloadJson, MessageSnippetResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Pending outgoing reply payload is malformed", exception);
        }
    }

    private String serializeAttachments(List<PendingOutgoingMessageAttachmentPayload> attachments) {
        try {
            return objectMapper.writeValueAsString(attachments == null ? List.of() : attachments);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pending message attachments are invalid");
        }
    }

    private List<PendingOutgoingMessageAttachmentPayload> deserializeAttachments(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(payloadJson, ATTACHMENTS_TYPE);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Pending outgoing attachments payload is malformed", exception);
        }
    }
}
