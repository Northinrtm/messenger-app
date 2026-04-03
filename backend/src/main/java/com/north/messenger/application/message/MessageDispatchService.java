package com.north.messenger.application.message;

import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.observability.MessengerTelemetry;
import io.micrometer.core.instrument.Timer;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageDispatchService {

    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final AuthService authService;
    private final MessengerTelemetry telemetry;
    private final MessageSupport messageSupport;

    MessageDispatchService(
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            AuthService authService,
            MessengerTelemetry telemetry,
            MessageSupport messageSupport
    ) {
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.authService = authService;
        this.telemetry = telemetry;
        this.messageSupport = messageSupport;
    }

    void dispatchMessage(MessageDispatchEvent event) {
        ChatMessage message = chatMessageRepository.findById(event.messageId()).orElse(null);
        if (message == null) {
            telemetry.recordMessageDispatchMissing(event.chatId(), event.messageId(), "after_commit");
            return;
        }
        broadcastMessage(message, event.clientMessageId(), "after_commit");
    }

    void broadcastMessage(ChatMessage message, String senderClientMessageId, String source) {
        Timer.Sample telemetrySample = telemetry.startSample();
        ChatRoom room = chatService.getChatRoom(message.getChatId());
        UserAccount sender = userAccountRepository.findById(message.getSenderId()).orElse(null);
        if (sender == null || room == null) {
            if (room != null) {
                telemetry.recordMessageDispatch(
                        telemetrySample,
                        room,
                        0,
                        source,
                        "missing_sender",
                        message.getChatId(),
                        message.getId()
                );
            } else {
                telemetry.recordMessageDispatchMissing(message.getChatId(), message.getId(), source);
            }
            return;
        }

        int participantCount = 0;
        try {
            List<UserAccount> participants = chatService.findParticipants(message.getChatId());
            participantCount = participants.size();
            MessageSupport.MessageReceiptSummary summary = messageSupport.loadReceiptSummaries(List.of(message.getId()))
                    .getOrDefault(message.getId(), MessageSupport.MessageReceiptSummary.empty());
            Map<UUID, MessageSnippetResponse> repliesByMessageId = messageSupport.loadReplySnippetsByMessageId(
                    List.of(message),
                    participants.stream().collect(Collectors.toMap(UserAccount::getId, Function.identity()))
            );
            ParticipantResponse senderParticipant = authService.toParticipant(sender);
            Map<String, String> encryptedKeysByUserId = messageSupport.deserializeEncryptedKeys(message);
            Map<String, List<MessageReaction>> reactionsByKey = messageReactionRepository.findAllByMessageIdIn(
                            List.of(message.getId())
                    ).stream()
                    .collect(Collectors.groupingBy(MessageReaction::getReactionKey));
            MessageSnippetResponse replyTo = repliesByMessageId.get(message.getId());

            participants.forEach(participant -> {
                List<MessageReactionSummaryResponse> reactions = messageSupport.summarizeReactions(
                        reactionsByKey,
                        participant.getId()
                );
                EncryptedMessagePayloadResponse encryptedPayload = messageSupport.toEncryptedPayload(
                        message,
                        participant.getId(),
                        encryptedKeysByUserId
                );
                MessageResponse response = participant.getId().equals(sender.getId())
                        ? messageSupport.toResponse(message, senderParticipant, participant.getId(), summary, reactions, senderClientMessageId, replyTo, encryptedPayload)
                        : messageSupport.toResponse(message, senderParticipant, participant.getId(), summary, reactions, null, replyTo, encryptedPayload);
                realtimeMessagingGateway.sendToUser(participant.getUsername(), "/queue/messages", response);
            });
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "sent", message.getChatId(), message.getId());
            chatService.notifyChatUpdated(message.getChatId());
        } catch (RuntimeException exception) {
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "error", message.getChatId(), message.getId());
            throw exception;
        }
    }
}
