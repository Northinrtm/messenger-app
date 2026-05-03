package com.north.messenger.application.message;

import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageDispatchService {

    private static final Logger log = LoggerFactory.getLogger(MessageDispatchService.class);
    private static final String MESSAGE_ACK_DESTINATION = "/queue/message-acks";
    private static final String MESSAGE_DELIVERY_DESTINATION = "/queue/messages";

    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final AuthService authService;
    private final MessengerTelemetry telemetry;
    private final MessageSupport messageSupport;
    private final PushNotificationDeliveryService pushNotificationDeliveryService;

    MessageDispatchService(
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            AuthService authService,
            MessengerTelemetry telemetry,
            MessageSupport messageSupport,
            PushNotificationDeliveryService pushNotificationDeliveryService
    ) {
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.authService = authService;
        this.telemetry = telemetry;
        this.messageSupport = messageSupport;
        this.pushNotificationDeliveryService = pushNotificationDeliveryService;
    }

    void dispatchMessage(MessageDispatchEvent event) {
        dispatchMessage(event, "outbox");
    }

    void dispatchMessage(MessageDispatchEvent event, String source) {
        ChatMessage message = chatMessageRepository.findById(event.messageId()).orElse(null);
        if (message == null) {
            log.error(
                    "Message dispatch missing committed payload chatId={} messageId={} clientMessageId={} source={}",
                    event.chatId(),
                    event.messageId(),
                    event.clientMessageId(),
                    source
            );
            telemetry.recordMessageDispatchMissing(event.chatId(), event.messageId(), source);
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.missing_payload",
                    event.chatId(),
                    event.messageId(),
                    null,
                    event.clientMessageId(),
                    null,
                    "Committed message payload was missing during dispatch",
                    List.of("source=" + source),
                    null
            );
            return;
        }
        if (event.mode() == MessageDispatchMode.ACK_ONLY) {
            acknowledgeSender(message, event.clientMessageId(), source + "_ack_only");
            return;
        }
        broadcastMessage(message, event.clientMessageId(), source);
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
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.missing_sender_or_room",
                    message.getChatId(),
                    message.getId(),
                    sender != null ? sender.getUsername() : null,
                    senderClientMessageId,
                    null,
                    "Sender or chat room was unavailable during dispatch",
                    List.of("source=" + source),
                    null
            );
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
            Map<String, List<MessageReaction>> reactionsByKey = messageReactionRepository.findAllByMessageIdIn(
                            List.of(message.getId())
                    ).stream()
                    .collect(Collectors.groupingBy(MessageReaction::getReactionKey));
            MessageSnippetResponse replyTo = repliesByMessageId.get(message.getId());

            MessageResponse senderAck = messageSupport.toResponse(
                    message,
                    senderParticipant,
                    sender.getId(),
                    summary,
                    messageSupport.summarizeReactions(reactionsByKey, sender.getId()),
                    senderClientMessageId,
                    replyTo,
                    messageSupport.toEncryptedPayload(message)
            );
            realtimeMessagingGateway.sendToUser(sender.getUsername(), MESSAGE_ACK_DESTINATION, senderAck);

            participants.forEach(participant -> {
                List<MessageReactionSummaryResponse> reactions = messageSupport.summarizeReactions(
                        reactionsByKey,
                        participant.getId()
                );
                EncryptedMessagePayloadResponse encryptedPayload = messageSupport.toEncryptedPayload(message);
                MessageResponse response = participant.getId().equals(sender.getId())
                        ? messageSupport.toResponse(message, senderParticipant, participant.getId(), summary, reactions, senderClientMessageId, replyTo, encryptedPayload)
                        : messageSupport.toResponse(message, senderParticipant, participant.getId(), summary, reactions, null, replyTo, encryptedPayload);
                realtimeMessagingGateway.sendToUser(participant.getUsername(), MESSAGE_DELIVERY_DESTINATION, response);
            });
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "sent", message.getChatId(), message.getId());
            pushNotificationDeliveryService.notifyNewMessage(message, participants, sender);
            chatService.notifyChatUpdated(message.getChatId());
        } catch (RuntimeException exception) {
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "error", message.getChatId(), message.getId());
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.broadcast",
                    message.getChatId(),
                    message.getId(),
                    sender.getUsername(),
                    senderClientMessageId,
                    null,
                    exception.getMessage(),
                    List.of("source=" + source, exception.getClass().getSimpleName()),
                    exception
            );
            throw exception;
        }
    }

    void acknowledgeSender(ChatMessage message, String senderClientMessageId, String source) {
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
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.ack_only_missing_sender_or_room",
                    message.getChatId(),
                    message.getId(),
                    sender != null ? sender.getUsername() : null,
                    senderClientMessageId,
                    null,
                    "Sender or chat room was unavailable during ack-only dispatch",
                    List.of("source=" + source),
                    null
            );
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
            Map<String, List<MessageReaction>> reactionsByKey = messageReactionRepository.findAllByMessageIdIn(
                            List.of(message.getId())
                    ).stream()
                    .collect(Collectors.groupingBy(MessageReaction::getReactionKey));
            MessageResponse response = messageSupport.toResponse(
                    message,
                    authService.toParticipant(sender),
                    sender.getId(),
                    summary,
                    messageSupport.summarizeReactions(reactionsByKey, sender.getId()),
                    senderClientMessageId,
                    repliesByMessageId.get(message.getId()),
                    messageSupport.toEncryptedPayload(message)
            );
            realtimeMessagingGateway.sendToUser(sender.getUsername(), MESSAGE_ACK_DESTINATION, response);
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "acked", message.getChatId(), message.getId());
            MessageSendDiagnostics.logOutcome(
                    "outbox",
                    "dispatch.ack_only_sent",
                    "acked",
                    message.getChatId(),
                    message.getId(),
                    sender.getUsername(),
                    senderClientMessageId
            );
        } catch (RuntimeException exception) {
            telemetry.recordMessageDispatch(telemetrySample, room, participantCount, source, "error", message.getChatId(), message.getId());
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.ack_only",
                    message.getChatId(),
                    message.getId(),
                    sender.getUsername(),
                    senderClientMessageId,
                    null,
                    exception.getMessage(),
                    List.of("source=" + source, exception.getClass().getSimpleName()),
                    exception
            );
            throw exception;
        }
    }
}
