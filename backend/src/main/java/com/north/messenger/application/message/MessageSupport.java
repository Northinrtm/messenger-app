package com.north.messenger.application.message;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadResponse;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageReactionSummaryResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.MessageStatusResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.e2ee.DeviceKeyValidationService;
import com.north.messenger.domain.model.ChatGroupSenderKeyCounter;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatMessageRecipientPayload;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.MessageReaction;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionEnvelopeCounter;
import com.north.messenger.domain.model.UserEncryptionOneTimePrekey;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.repository.ChatGroupSenderKeyCounterRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionEnvelopeCounterRepository;
import com.north.messenger.domain.repository.UserEncryptionOneTimePrekeyRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatMessageRecipientPayloadRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.observability.MessengerTelemetry;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.time.Instant;
import java.util.Base64;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class MessageSupport {

    private static final List<String> REACTION_KEYS = List.of("LIKE", "DISLIKE", "EYES", "OK");
    private static final String DEVICE_TRANSPORT_SCHEME = "X3DH-DEVICE-AES-GCM";
    private static final String GROUP_SENDER_KEY_SCHEME = "GROUP-SENDER-KEY-AES-GCM";
    private static final int GROUP_SHARED_ENVELOPE_AAD_VERSION = 1;
    private static final int MAX_DEVICE_COUNTER_ADVANCE = 4_096;
    private static final int MAX_GROUP_COUNTER_ADVANCE = 4_096;

    private final AuthService authService;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatMessageRecipientPayloadRepository chatMessageRecipientPayloadRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private final UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository;
    private final UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository;
    private final UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private final ChatGroupSenderKeyCounterRepository chatGroupSenderKeyCounterRepository;
    private final DeviceKeyValidationService deviceKeyValidationService;
    private final MessengerTelemetry telemetry;
    private final ObjectMapper objectMapper;

    MessageSupport(
            AuthService authService,
            ChatMessageRepository chatMessageRepository,
            ChatMessageRecipientPayloadRepository chatMessageRecipientPayloadRepository,
            MessageReceiptRepository messageReceiptRepository,
            MessageReactionRepository messageReactionRepository,
            UserAccountRepository userAccountRepository,
            UserEncryptionDeviceRepository userEncryptionDeviceRepository,
            UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository,
            UserEncryptionOneTimePrekeyRepository userEncryptionOneTimePrekeyRepository,
            UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository,
            ChatGroupSenderKeyCounterRepository chatGroupSenderKeyCounterRepository,
            DeviceKeyValidationService deviceKeyValidationService,
            MessengerTelemetry telemetry,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.chatMessageRepository = chatMessageRepository;
        this.chatMessageRecipientPayloadRepository = chatMessageRecipientPayloadRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.userAccountRepository = userAccountRepository;
        this.userEncryptionDeviceRepository = userEncryptionDeviceRepository;
        this.userEncryptionEnvelopeCounterRepository = userEncryptionEnvelopeCounterRepository;
        this.userEncryptionOneTimePrekeyRepository = userEncryptionOneTimePrekeyRepository;
        this.userEncryptionSignedPrekeyRepository = userEncryptionSignedPrekeyRepository;
        this.chatGroupSenderKeyCounterRepository = chatGroupSenderKeyCounterRepository;
        this.deviceKeyValidationService = deviceKeyValidationService;
        this.telemetry = telemetry;
        this.objectMapper = objectMapper;
    }

    Map<UUID, MessageSnippetResponse> loadReplySnippetsByMessageId(
            Collection<ChatMessage> messages,
            Map<UUID, UserAccount> knownUsersById
    ) {
        List<ChatMessage> messagesWithReply = messages.stream()
                .filter(message -> message.getReplyToMessageId() != null)
                .toList();
        if (messagesWithReply.isEmpty()) {
            return Map.of();
        }

        Map<UUID, ChatMessage> referencedMessagesById = chatMessageRepository.findAllById(
                        messagesWithReply.stream().map(ChatMessage::getReplyToMessageId).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        if (referencedMessagesById.isEmpty()) {
            return Map.of();
        }

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
                                    summarizeMessagePreview(referencedMessage)
                            )
                    );
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    MessageResponse findExistingMessageResponse(UUID chatId, UserAccount currentUser, String clientMessageId) {
        if (clientMessageId == null) {
            return null;
        }

        ChatMessage existingMessage = chatMessageRepository
                .findByChatIdAndSenderIdAndClientMessageId(chatId, currentUser.getId(), clientMessageId)
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
        return toResponse(
                existingMessage,
                currentUser,
                currentUser.getId(),
                summary,
                reactions,
                existingMessage.getClientMessageId(),
                loadReplySnippetsByMessageId(List.of(existingMessage), Map.of(currentUser.getId(), currentUser))
                        .get(existingMessage.getId())
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
                toEncryptedPayload(message, currentUserId)
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
            EncryptedMessagePayloadResponse encryptedPayload
    ) {
        return toResponse(
                message,
                authService.toParticipant(sender),
                currentUserId,
                summary,
                reactions,
                clientMessageId,
                replyTo,
                encryptedPayload
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
            EncryptedMessagePayloadResponse encryptedPayload
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
                encryptedPayload
        );
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

    UUID validateReplyTarget(UUID chatId, UUID replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }

        ChatMessage replyTarget = chatMessageRepository.findById(replyToMessageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply target not found"));
        if (!replyTarget.getChatId().equals(chatId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply target must belong to the same chat");
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

    ValidatedEncryptedPayload validateEncryptedPayload(
            EncryptedMessagePayloadRequest payload,
            ChatRoom room,
            UserAccount currentUser,
            List<UserAccount> participants
    ) {
        if (payload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload is incomplete");
        }
        if (payload.scheme().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload is incomplete");
        }

        Map<String, String> encryptedKeysByRecipientId = payload.encryptedKeysByRecipientId();
        if (encryptedKeysByRecipientId == null || encryptedKeysByRecipientId.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted payload keys are required");
        }

        if (room.isDirect() && !DEVICE_TRANSPORT_SCHEME.equals(payload.scheme())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Direct chats must use current device transport"
            );
        }
        if (!room.isDirect() && !GROUP_SENDER_KEY_SCHEME.equals(payload.scheme())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group chats must use current shared device transport"
            );
        }

        GroupSharedEnvelope groupSharedEnvelope = room.isDirect()
                ? null
                : parseGroupSharedEnvelope(payload.sharedEnvelope(), room.getId());
        Instant now = Instant.now();

        Map<String, UserEncryptionDevice> knownDevicesById = visibleDevices(
                        userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(
                                participants.stream().map(UserAccount::getId).toList()
                        )
                ).stream()
                .collect(Collectors.toMap(device -> device.getId().toString(), Function.identity()));

        if (knownDevicesById.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted payload requires registered devices for chat participants"
            );
        }

        if (!knownDevicesById.keySet().containsAll(encryptedKeysByRecipientId.keySet())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted payload contains unknown recipient devices"
            );
        }

        Map<String, String> validatedEncryptedKeysByRecipientId = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : encryptedKeysByRecipientId.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()
                    || entry.getValue() == null || entry.getValue().isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted payload keys are incomplete"
                );
            }
            validatedEncryptedKeysByRecipientId.put(entry.getKey(), entry.getValue());
        }
        UserEncryptionDevice senderDevice = null;
        Map<UUID, DeviceEnvelope> validatedEnvelopesByRecipientDeviceId = new HashMap<>();
        Map<UUID, BootstrapPrekeyBinding> bootstrapPrekeyBindingsByRecipientDeviceId = new HashMap<>();
        Map<DeviceSignedPrekeyRef, UserEncryptionSignedPrekey> activeSignedPrekeysByRef =
                userEncryptionSignedPrekeyRepository.findAllActiveByDeviceIdIn(
                                knownDevicesById.values().stream()
                                        .map(UserEncryptionDevice::getId)
                                        .distinct()
                                        .toList(),
                                now
                        ).stream()
                        .collect(Collectors.toMap(
                                prekey -> new DeviceSignedPrekeyRef(prekey.getDeviceId(), prekey.getKeyId()),
                                Function.identity(),
                                (left, right) -> left
                        ));
        for (Map.Entry<String, String> entry : validatedEncryptedKeysByRecipientId.entrySet()) {
            UserEncryptionDevice recipientDevice = knownDevicesById.get(entry.getKey());
            if (recipientDevice == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted payload contains unknown recipient devices"
                );
            }

            DeviceEnvelope envelope = parseDeviceEnvelope(entry.getValue());
            if (!envelope.senderUserId().equals(currentUser.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope sender must match current user"
                );
            }
            if (!envelope.recipientDeviceId().equals(recipientDevice.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope recipient device is invalid"
                );
            }

            if (senderDevice == null) {
                senderDevice = knownDevicesById.get(envelope.senderDeviceId().toString());
                if (senderDevice == null || !senderDevice.getUserId().equals(currentUser.getId())) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Encrypted device envelope sender device is invalid"
                    );
                }
                if (!senderDevice.getIdentityKey().equals(envelope.senderIdentityKey())
                        || !senderDevice.getIdentitySignatureKey().equals(envelope.senderIdentitySignatureKey())) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Encrypted device envelope sender identity does not match the registered device"
                    );
                }
            } else if (!senderDevice.getId().equals(envelope.senderDeviceId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted payload must use the same sender device for all recipient envelopes"
                );
            }

            UserEncryptionSignedPrekey recipientSignedPrekey = activeSignedPrekeysByRef.get(
                    new DeviceSignedPrekeyRef(recipientDevice.getId(), envelope.recipientSignedPrekeyId())
            );
            if (recipientSignedPrekey == null) {
                recipientSignedPrekey = userEncryptionSignedPrekeyRepository
                        .findActiveByDeviceIdAndKeyId(
                                recipientDevice.getId(),
                                envelope.recipientSignedPrekeyId(),
                                now
                        )
                        .orElse(null);
            }
            if (recipientSignedPrekey == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope recipient prekey is stale"
                );
            }
            BootstrapPrekeyBinding bootstrapPrekeyBinding = validateEnvelopeRecipientOneTimePrekey(
                    envelope,
                    senderDevice,
                    recipientDevice
            );
            if (bootstrapPrekeyBinding != null) {
                bootstrapPrekeyBindingsByRecipientDeviceId.put(recipientDevice.getId(), bootstrapPrekeyBinding);
            }

            validatedEnvelopesByRecipientDeviceId.put(recipientDevice.getId(), envelope);
        }

        if (groupSharedEnvelope != null
                && (senderDevice == null
                || !groupSharedEnvelope.senderUserId().equals(currentUser.getId())
                || !groupSharedEnvelope.senderDeviceId().equals(senderDevice.getId()))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope sender is invalid"
            );
        }

        Set<UUID> coveredUsers = validatedEncryptedKeysByRecipientId.keySet().stream()
                .map(knownDevicesById::get)
                .filter(Objects::nonNull)
                .map(UserEncryptionDevice::getUserId)
                .collect(Collectors.toSet());
        Set<UUID> expectedUsers = participants.stream().map(UserAccount::getId).collect(Collectors.toSet());
        if (!coveredUsers.containsAll(expectedUsers)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted payload must include at least one recipient device per participant"
            );
        }
        Set<String> expectedRecipientDeviceIds = knownDevicesById.keySet();
        if (!validatedEncryptedKeysByRecipientId.keySet().equals(expectedRecipientDeviceIds)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted payload must include every active participant device"
            );
        }

        if (senderDevice != null) {
            if (groupSharedEnvelope != null) {
                validateAndAdvanceGroupEnvelopeCounter(room, senderDevice, groupSharedEnvelope);
            }
            validateAndAdvanceEnvelopeCounters(senderDevice, validatedEnvelopesByRecipientDeviceId);
            acceptBootstrapPrekeys(bootstrapPrekeyBindingsByRecipientDeviceId, Instant.now());
        }
        List<StoredRecipientPayload> storedRecipientPayloads = validatedEncryptedKeysByRecipientId.entrySet().stream()
                .map(entry -> {
                    UserEncryptionDevice recipientDevice = knownDevicesById.get(entry.getKey());
                    if (recipientDevice == null) {
                        throw new IllegalStateException("Validated recipient device disappeared before persistence");
                    }
                    return new StoredRecipientPayload(
                            recipientDevice.getUserId(),
                            recipientDevice.getId(),
                            entry.getValue()
                    );
                })
                .toList();
        return new ValidatedEncryptedPayload(validatedEncryptedKeysByRecipientId, storedRecipientPayloads);
    }

    private void validateAndAdvanceEnvelopeCounters(
            UserEncryptionDevice senderDevice,
            Map<UUID, DeviceEnvelope> envelopesByRecipientDeviceId
    ) {
        Instant now = Instant.now();
        for (Map.Entry<UUID, DeviceEnvelope> entry : envelopesByRecipientDeviceId.entrySet()) {
            UUID recipientDeviceId = entry.getKey();
            DeviceEnvelope envelope = entry.getValue();
            UserEncryptionEnvelopeCounter counter = userEncryptionEnvelopeCounterRepository
                    .findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(
                            senderDevice.getId(),
                            recipientDeviceId,
                            envelope.ratchetPublicKey()
                    )
                    .orElse(null);
            if (counter == null) {
                validateInitialEnvelopeCounter(envelope);
                if (userEncryptionEnvelopeCounterRepository.insertIfAbsent(
                        UUID.randomUUID(),
                        senderDevice.getId(),
                        recipientDeviceId,
                        envelope.ratchetPublicKey(),
                        envelope.initiatorEphemeralPublicKey(),
                        envelope.messageCounter(),
                        now
                ) == 1) {
                    continue;
                }
                counter = userEncryptionEnvelopeCounterRepository
                        .findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(
                                senderDevice.getId(),
                                recipientDeviceId,
                                envelope.ratchetPublicKey()
                        )
                        .orElseThrow(() -> new IllegalStateException(
                                "Encrypted device envelope counter was not persisted after concurrent insert"
                        ));
            }

            validateExistingEnvelopeCounter(counter, envelope);
            counter.bindInitiatorEphemeralPublicKeyIfMissing(envelope.initiatorEphemeralPublicKey());
            counter.advanceTo(envelope.messageCounter(), now);
            userEncryptionEnvelopeCounterRepository.save(counter);
        }
    }

    private void validateInitialEnvelopeCounter(DeviceEnvelope envelope) {
        if (envelope.messageCounter() != 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope must start at counter zero"
            );
        }
    }

    private void validateExistingEnvelopeCounter(
            UserEncryptionEnvelopeCounter counter,
            DeviceEnvelope envelope
    ) {
        if (envelope.messageCounter() <= counter.getLastMessageCounter()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope message counter is stale"
            );
        }
        if (counter.getInitiatorEphemeralPublicKey() != null
                && !counter.getInitiatorEphemeralPublicKey().isBlank()
                && !counter.getInitiatorEphemeralPublicKey().equals(envelope.initiatorEphemeralPublicKey())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope chain metadata is invalid"
            );
        }
        if (envelope.messageCounter() - counter.getLastMessageCounter() > MAX_DEVICE_COUNTER_ADVANCE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope message counter advanced too far"
            );
        }
    }

    private void validateAndAdvanceGroupEnvelopeCounter(
            ChatRoom room,
            UserEncryptionDevice senderDevice,
            GroupSharedEnvelope envelope
    ) {
        deviceKeyValidationService.verifyEd25519Signature(
                senderDevice.getIdentitySignatureKey(),
                envelope.signature(),
                buildGroupEnvelopeSignatureData(envelope),
                "Encrypted group envelope signature is invalid"
        );

        Instant now = Instant.now();
        ChatGroupSenderKeyCounter counter = chatGroupSenderKeyCounterRepository
                .findByChatIdAndSenderDeviceIdAndSenderKeyId(
                        room.getId(),
                        senderDevice.getId(),
                        envelope.senderKeyId()
                )
                .orElse(null);
        if (counter != null && envelope.messageCounter() <= counter.getLastMessageCounter()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope message counter is stale"
            );
        }
        if (counter == null && envelope.messageCounter() != 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope must start at counter zero"
            );
        }
        if (counter != null
                && envelope.messageCounter() - counter.getLastMessageCounter() > MAX_GROUP_COUNTER_ADVANCE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope message counter advanced too far"
            );
        }

        if (counter == null) {
            counter = new ChatGroupSenderKeyCounter(
                    UUID.randomUUID(),
                    room.getId(),
                    senderDevice.getId(),
                    envelope.senderKeyId(),
                    envelope.messageCounter(),
                    now
            );
        } else {
            counter.advanceTo(envelope.messageCounter(), now);
        }
        chatGroupSenderKeyCounterRepository.save(counter);
    }

    private BootstrapPrekeyBinding validateEnvelopeRecipientOneTimePrekey(
            DeviceEnvelope envelope,
            UserEncryptionDevice senderDevice,
            UserEncryptionDevice recipientDevice
    ) {
        if (envelope.recipientOneTimePrekeyId() == null) {
            return null;
        }
        if (envelope.messageCounter() != 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope one-time prekey is only allowed on bootstrap"
            );
        }
        UserEncryptionOneTimePrekey oneTimePrekey = userEncryptionOneTimePrekeyRepository
                .findByDeviceIdAndKeyId(recipientDevice.getId(), envelope.recipientOneTimePrekeyId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope recipient one-time prekey is invalid"
                ));
        if (oneTimePrekey.getClaimedAt() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope recipient one-time prekey is invalid"
            );
        }
        if (oneTimePrekey.getClaimedBySenderDeviceId() == null
                || !oneTimePrekey.getClaimedBySenderDeviceId().equals(senderDevice.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                "Encrypted device envelope recipient one-time prekey sender is invalid"
            );
        }
        if (oneTimePrekey.getAcceptedAt() != null
                && (!Objects.equals(
                        oneTimePrekey.getAcceptedInitiatorEphemeralPublicKey(),
                        envelope.initiatorEphemeralPublicKey()
                )
                || !Objects.equals(
                        oneTimePrekey.getAcceptedRatchetPublicKey(),
                        envelope.ratchetPublicKey()
                ))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope recipient one-time prekey was already used"
            );
        }
        return new BootstrapPrekeyBinding(
                oneTimePrekey,
                envelope.initiatorEphemeralPublicKey(),
                envelope.ratchetPublicKey()
        );
    }

    private void acceptBootstrapPrekeys(
            Map<UUID, BootstrapPrekeyBinding> bootstrapPrekeyBindingsByRecipientDeviceId,
            Instant acceptedAt
    ) {
        bootstrapPrekeyBindingsByRecipientDeviceId.values().forEach(binding -> {
            UserEncryptionOneTimePrekey prekey = binding.prekey();
            if (prekey.getAcceptedAt() == null) {
                prekey.acceptBootstrap(
                        acceptedAt,
                        binding.initiatorEphemeralPublicKey(),
                        binding.ratchetPublicKey()
                );
                userEncryptionOneTimePrekeyRepository.save(prekey);
            }
        });
    }

    private byte[] buildGroupEnvelopeSignatureData(GroupSharedEnvelope envelope) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("aadVersion", GROUP_SHARED_ENVELOPE_AAD_VERSION);
            payload.put("chatId", envelope.chatId());
            payload.put("senderUserId", envelope.senderUserId());
            payload.put("senderDeviceId", envelope.senderDeviceId());
            payload.put("senderKeyId", envelope.senderKeyId());
            payload.put("messageCounter", envelope.messageCounter());
            payload.put("iv", envelope.iv());
            payload.put("ciphertext", envelope.ciphertext());
            return objectMapper.writeValueAsBytes(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize encrypted group envelope signature payload", exception);
        }
    }

    StoredEncryptedEnvelope extractStoredEnvelope(EncryptedMessagePayloadRequest payload) {
        if (GROUP_SENDER_KEY_SCHEME.equals(payload.scheme())) {
            GroupSharedEnvelope groupSharedEnvelope = parseGroupSharedEnvelope(payload.sharedEnvelope(), null);
            return new StoredEncryptedEnvelope(payload.sharedEnvelope(), groupSharedEnvelope.iv());
        }

        Map<String, String> encryptedKeysByRecipientId = payload.encryptedKeysByRecipientId();
        String serializedEnvelope = encryptedKeysByRecipientId.values().stream()
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted payload keys are required"
                ));
        DeviceEnvelope envelope = parseDeviceEnvelope(serializedEnvelope);
        return new StoredEncryptedEnvelope(envelope.ciphertext(), envelope.iv());
    }

    private DeviceEnvelope parseDeviceEnvelope(String serializedEnvelope) {
        try {
            JsonNode envelope = objectMapper.readTree(serializedEnvelope);
            if (envelope.path("aadVersion").asInt(-1) != 1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope must use current authenticated format"
                );
            }
            String senderUserId = envelope.path("senderUserId").asText();
            String senderDeviceId = envelope.path("senderDeviceId").asText();
            String recipientDeviceId = envelope.path("recipientDeviceId").asText();
            String senderIdentityKey = envelope.path("senderIdentityKey").asText();
            String senderIdentitySignatureKey = envelope.path("senderIdentitySignatureKey").asText();
            String initiatorEphemeralPublicKey = envelope.path("initiatorEphemeralPublicKey").asText();
            String ratchetPublicKey = envelope.path("ratchetPublicKey").asText();
            String ciphertext = envelope.path("ciphertext").asText();
            String iv = envelope.path("iv").asText();
            if (senderUserId == null || senderUserId.isBlank()
                    || senderDeviceId == null || senderDeviceId.isBlank()
                    || recipientDeviceId == null || recipientDeviceId.isBlank()
                    || senderIdentityKey == null || senderIdentityKey.isBlank()
                    || senderIdentitySignatureKey == null || senderIdentitySignatureKey.isBlank()
                    || initiatorEphemeralPublicKey == null || initiatorEphemeralPublicKey.isBlank()
                    || ratchetPublicKey == null || ratchetPublicKey.isBlank()
                    || ciphertext == null || ciphertext.isBlank()
                    || iv == null || iv.isBlank()
                    || !envelope.path("recipientSignedPrekeyId").canConvertToInt()
                    || !envelope.path("messageCounter").canConvertToInt()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope is incomplete"
                );
            }

            int recipientSignedPrekeyId = envelope.path("recipientSignedPrekeyId").asInt();
            int messageCounter = envelope.path("messageCounter").asInt();
            if (recipientSignedPrekeyId < 0 || messageCounter < 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope is incomplete"
                );
            }
            JsonNode recipientOneTimePrekeyIdNode = envelope.path("recipientOneTimePrekeyId");
            Integer recipientOneTimePrekeyId = null;
            if (!recipientOneTimePrekeyIdNode.isMissingNode() && !recipientOneTimePrekeyIdNode.isNull()) {
                if (!recipientOneTimePrekeyIdNode.canConvertToInt()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Encrypted device envelope is malformed"
                    );
                }
                recipientOneTimePrekeyId = recipientOneTimePrekeyIdNode.asInt();
                if (recipientOneTimePrekeyId < 0) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Encrypted device envelope is malformed"
                    );
                }
            }

            validateBase64(iv, "Encrypted device envelope is malformed");
            validateBase64(ciphertext, "Encrypted device envelope is malformed");
            if (Base64.getDecoder().decode(iv).length != 12) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted device envelope is malformed"
                );
            }
            deviceKeyValidationService.validateDirectEnvelopeTransportKeys(
                    initiatorEphemeralPublicKey,
                    ratchetPublicKey
            );

            return new DeviceEnvelope(
                    UUID.fromString(senderUserId),
                    UUID.fromString(senderDeviceId),
                    UUID.fromString(recipientDeviceId),
                    senderIdentityKey,
                    senderIdentitySignatureKey,
                    initiatorEphemeralPublicKey,
                    ratchetPublicKey,
                    recipientSignedPrekeyId,
                    recipientOneTimePrekeyId,
                    messageCounter,
                    ciphertext,
                    iv
            );
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope is malformed"
            );
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Encrypted device envelope is malformed"
            );
        }
    }

    private GroupSharedEnvelope parseGroupSharedEnvelope(String serializedEnvelope, UUID expectedChatId) {
        if (serializedEnvelope == null || serializedEnvelope.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope is required"
            );
        }

        try {
            JsonNode envelope = objectMapper.readTree(serializedEnvelope);
            if (envelope.path("aadVersion").asInt(-1) != 1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group envelope must use current authenticated format"
                );
            }

            String chatId = envelope.path("chatId").asText();
            String senderUserId = envelope.path("senderUserId").asText();
            String senderDeviceId = envelope.path("senderDeviceId").asText();
            String senderKeyId = envelope.path("senderKeyId").asText();
            String ciphertext = envelope.path("ciphertext").asText();
            String iv = envelope.path("iv").asText();
            String signature = envelope.path("signature").asText();
            if (chatId == null || chatId.isBlank()
                    || senderUserId == null || senderUserId.isBlank()
                    || senderDeviceId == null || senderDeviceId.isBlank()
                    || senderKeyId == null || senderKeyId.isBlank()
                    || ciphertext == null || ciphertext.isBlank()
                    || iv == null || iv.isBlank()
                    || signature == null || signature.isBlank()
                    || !envelope.path("messageCounter").canConvertToInt()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group envelope is incomplete"
                );
            }

            int messageCounter = envelope.path("messageCounter").asInt();
            if (messageCounter < 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group envelope is incomplete"
                );
            }

            validateBase64(iv, "Encrypted group envelope is malformed");
            validateBase64(ciphertext, "Encrypted group envelope is malformed");
            validateBase64(signature, "Encrypted group envelope is malformed");
            if (Base64.getDecoder().decode(iv).length != 12) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group envelope is malformed"
                );
            }

            UUID parsedChatId = UUID.fromString(chatId);
            if (expectedChatId != null && !expectedChatId.equals(parsedChatId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group envelope chat is invalid"
                );
            }

            return new GroupSharedEnvelope(
                    parsedChatId,
                    UUID.fromString(senderUserId),
                    UUID.fromString(senderDeviceId),
                    senderKeyId,
                    messageCounter,
                    ciphertext,
                    iv,
                    signature
            );
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope is malformed"
            );
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group envelope is malformed"
            );
        }
    }

    private void validateBase64(String value, String message) {
        try {
            Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
    }

    private List<UserEncryptionDevice> visibleDevices(List<UserEncryptionDevice> devices) {
        return devices.stream()
                .filter(deviceKeyValidationService::hasValidCurrentSignedPrekey)
                .toList();
    }

    Map<String, String> loadEncryptedKeys(ChatMessage message) {
        Map<UUID, Map<String, String>> encryptedKeysByMessageId = loadEncryptedKeysByMessageId(List.of(message));
        return encryptedKeysByMessageId.getOrDefault(message.getId(), Map.of());
    }

    Map<UUID, Map<String, String>> loadEncryptedKeysByMessageId(Collection<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return Map.of();
        }

        Map<UUID, ChatMessage> messagesById = messages.stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        Map<UUID, Map<String, String>> encryptedKeysByMessageId = groupRecipientPayloadsByMessageId(
                chatMessageRecipientPayloadRepository.findAllByMessageIdIn(messagesById.keySet())
        );
        int normalizedMessageCount = encryptedKeysByMessageId.size();
        int legacySchemeFallbackCount = mergeLegacyEncryptedKeysForLegacySchemes(messagesById, encryptedKeysByMessageId);
        telemetry.recordMessagePayloadStorageSource("normalized", "all_devices", normalizedMessageCount);
        telemetry.recordMessagePayloadStorageSource("legacy_scheme_fallback", "all_devices", legacySchemeFallbackCount);
        telemetry.recordMessagePayloadStorageSource(
                "missing",
                "all_devices",
                messagesById.size() - normalizedMessageCount - legacySchemeFallbackCount
        );
        return encryptedKeysByMessageId;
    }

    Map<UUID, Map<String, String>> loadEncryptedKeysByMessageIdForUser(
            Collection<ChatMessage> messages,
            UUID recipientUserId
    ) {
        if (messages == null || messages.isEmpty()) {
            return Map.of();
        }

        Map<UUID, ChatMessage> messagesById = messages.stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        Map<UUID, Map<String, String>> encryptedKeysByMessageId = groupRecipientPayloadsByMessageId(
                chatMessageRecipientPayloadRepository.findAllByMessageIdInAndRecipientUserId(
                        messagesById.keySet(),
                        recipientUserId
                )
        );
        int normalizedMessageCount = encryptedKeysByMessageId.size();
        int legacySchemeFallbackCount = mergeLegacyEncryptedKeysForLegacySchemes(messagesById, encryptedKeysByMessageId);
        telemetry.recordMessagePayloadStorageSource("normalized", "recipient_user", normalizedMessageCount);
        telemetry.recordMessagePayloadStorageSource("legacy_scheme_fallback", "recipient_user", legacySchemeFallbackCount);
        telemetry.recordMessagePayloadStorageSource(
                "missing",
                "recipient_user",
                messagesById.size() - normalizedMessageCount - legacySchemeFallbackCount
        );
        return encryptedKeysByMessageId;
    }

    Map<String, String> deserializeEncryptedKeys(ChatMessage message) {
        if (message.getEncryptedKeysJson() == null || message.getEncryptedKeysJson().isBlank()) {
            return Map.of();
        }

        try {
            return objectMapper.readValue(message.getEncryptedKeysJson(), new TypeReference<Map<String, String>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize encrypted message keys", exception);
        }
    }

    EncryptedMessagePayloadResponse toEncryptedPayload(ChatMessage message, UUID currentUserId) {
        return toEncryptedPayload(message, currentUserId, loadEncryptedKeys(message));
    }

    void storeRecipientPayloads(
            UUID messageId,
            Instant createdAt,
            List<StoredRecipientPayload> storedRecipientPayloads
    ) {
        if (storedRecipientPayloads == null || storedRecipientPayloads.isEmpty()) {
            return;
        }

        chatMessageRecipientPayloadRepository.saveAll(
                storedRecipientPayloads.stream()
                        .map(payload -> new ChatMessageRecipientPayload(
                                messageId,
                                payload.recipientDeviceId(),
                                payload.recipientUserId(),
                                payload.encryptedPayload(),
                                createdAt
                        ))
                        .toList()
        );
    }

    void replaceRecipientPayloads(
            UUID messageId,
            Instant createdAt,
            List<StoredRecipientPayload> storedRecipientPayloads
    ) {
        chatMessageRecipientPayloadRepository.deleteAllByMessageId(messageId);
        storeRecipientPayloads(messageId, createdAt, storedRecipientPayloads);
    }

    EncryptedMessagePayloadResponse toEncryptedPayload(
            ChatMessage message,
            UUID currentUserId,
            Map<String, String> encryptedKeysByRecipientId
    ) {
        return toEncryptedPayload(
                message,
                currentUserId,
                encryptedKeysByRecipientId,
                loadVisibleDeviceIds(currentUserId)
        );
    }

    EncryptedMessagePayloadResponse toEncryptedPayload(
            ChatMessage message,
            UUID currentUserId,
            Map<String, String> encryptedKeysByRecipientId,
            Set<String> visibleCurrentUserDeviceIds
    ) {
        if (!message.isEncrypted()) {
            throw new IllegalStateException("Plaintext messages are not supported by the encrypted message API");
        }

        if (GROUP_SENDER_KEY_SCHEME.equals(message.getEncryptionScheme())) {
            Map<String, String> matchingDevicePayloads = visibleCurrentUserDeviceIds.stream()
                    .filter(encryptedKeysByRecipientId::containsKey)
                    .collect(Collectors.toMap(
                            deviceId -> deviceId,
                            encryptedKeysByRecipientId::get
                    ));
            if (matchingDevicePayloads.isEmpty()
                    && (message.getHistoryEnvelopeJson() == null || message.getHistoryEnvelopeJson().isBlank())) {
                throw new IllegalStateException(
                        "Encrypted group transport payload is missing for recipient devices of " + currentUserId
                );
            }
            if (message.getContent() == null || message.getContent().isBlank()) {
                throw new IllegalStateException("Encrypted group envelope is missing");
            }

            return new EncryptedMessagePayloadResponse(
                    message.getEncryptionScheme(),
                    matchingDevicePayloads,
                    message.getContent(),
                    message.getHistoryEnvelopeJson()
            );
        }

        if (DEVICE_TRANSPORT_SCHEME.equals(message.getEncryptionScheme())) {
            Map<String, String> matchingDevicePayloads = visibleCurrentUserDeviceIds.stream()
                    .filter(encryptedKeysByRecipientId::containsKey)
                    .collect(Collectors.toMap(
                            deviceId -> deviceId,
                            deviceId -> encryptedKeysByRecipientId.get(deviceId)
                    ));
            if (matchingDevicePayloads.isEmpty()) {
                throw new IllegalStateException("Encrypted direct payload is missing for recipient devices of " + currentUserId);
            }

            return new EncryptedMessagePayloadResponse(
                    message.getEncryptionScheme(),
                    matchingDevicePayloads
            );
        }

        String encryptedKey = encryptedKeysByRecipientId.get(currentUserId.toString());
        if (encryptedKey == null || encryptedKey.isBlank()) {
            throw new IllegalStateException("Encrypted message key is missing for recipient " + currentUserId);
        }
        return new EncryptedMessagePayloadResponse(
                message.getEncryptionScheme(),
                Map.of(currentUserId.toString(), encryptedKey)
        );
    }

    Set<String> loadVisibleDeviceIds(UUID userId) {
        return visibleDevices(
                        userEncryptionDeviceRepository.findAllByUserIdAndRetiredAtIsNullOrderByLastSeenAtDesc(userId)
                ).stream()
                .map(device -> device.getId().toString())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    Map<UUID, Set<String>> loadVisibleDeviceIdsByUserId(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }

        return visibleDevices(
                        userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.copyOf(userIds))
                ).stream()
                .collect(Collectors.groupingBy(
                        UserEncryptionDevice::getUserId,
                        Collectors.mapping(
                                device -> device.getId().toString(),
                                Collectors.toCollection(LinkedHashSet::new)
                        )
                ));
    }

    private Map<UUID, Map<String, String>> groupRecipientPayloadsByMessageId(
            Collection<ChatMessageRecipientPayload> payloads
    ) {
        Map<UUID, Map<String, String>> encryptedKeysByMessageId = new LinkedHashMap<>();
        payloads.forEach(payload -> encryptedKeysByMessageId
                .computeIfAbsent(payload.getMessageId(), ignored -> new LinkedHashMap<>())
                .put(payload.getRecipientDeviceId().toString(), payload.getEncryptedPayload()));
        return encryptedKeysByMessageId;
    }

    private int mergeLegacyEncryptedKeysForLegacySchemes(
            Map<UUID, ChatMessage> messagesById,
            Map<UUID, Map<String, String>> encryptedKeysByMessageId
    ) {
        int mergedCount = 0;
        for (Map.Entry<UUID, ChatMessage> entry : messagesById.entrySet()) {
            UUID messageId = entry.getKey();
            ChatMessage message = entry.getValue();
            if (encryptedKeysByMessageId.containsKey(messageId)) {
                continue;
            }
            if (DEVICE_TRANSPORT_SCHEME.equals(message.getEncryptionScheme())
                    || GROUP_SENDER_KEY_SCHEME.equals(message.getEncryptionScheme())) {
                continue;
            }

            Map<String, String> legacyEncryptedKeys = deserializeEncryptedKeys(message);
            if (!legacyEncryptedKeys.isEmpty()) {
                encryptedKeysByMessageId.put(messageId, new LinkedHashMap<>(legacyEncryptedKeys));
                mergedCount += 1;
            }
        }
        return mergedCount;
    }

    String summarizeMessagePreview(ChatMessage message) {
        return message.getEncryptionScheme() != null && !message.getEncryptionScheme().isBlank()
                ? "Encrypted message"
                : message.getContent();
    }

    enum ReceiptUpdateMode {
        DELIVERED,
        READ
    }

    enum DeleteScope {
        SELF,
        EVERYONE
    }

    record StoredEncryptedEnvelope(
            String ciphertext,
            String iv
    ) {
    }

    record DeviceEnvelope(
            UUID senderUserId,
            UUID senderDeviceId,
            UUID recipientDeviceId,
            String senderIdentityKey,
            String senderIdentitySignatureKey,
            String initiatorEphemeralPublicKey,
            String ratchetPublicKey,
            int recipientSignedPrekeyId,
            Integer recipientOneTimePrekeyId,
            int messageCounter,
            String ciphertext,
            String iv
    ) {
    }

    record GroupSharedEnvelope(
            UUID chatId,
            UUID senderUserId,
            UUID senderDeviceId,
            String senderKeyId,
            int messageCounter,
            String ciphertext,
            String iv,
            String signature
    ) {
    }

    record BootstrapPrekeyBinding(
            UserEncryptionOneTimePrekey prekey,
            String initiatorEphemeralPublicKey,
            String ratchetPublicKey
    ) {
    }

    record DeviceSignedPrekeyRef(
            UUID deviceId,
            int keyId
    ) {
    }

    record StoredRecipientPayload(
            UUID recipientUserId,
            UUID recipientDeviceId,
            String encryptedPayload
    ) {
    }

    record ValidatedEncryptedPayload(
            Map<String, String> encryptedKeysByRecipientId,
            List<StoredRecipientPayload> storedRecipientPayloads
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
