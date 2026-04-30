package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.GroupHistoryKeyAccessResponse;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.api.dto.UpsertGroupHistoryKeyRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatHistoryKey;
import com.north.messenger.domain.model.ChatHistoryKeyAccess;
import com.north.messenger.domain.model.ChatHistoryKeyUserAccess;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.repository.ChatHistoryKeyAccessRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyUserAccessRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatGroupHistoryKeyService {

    private static final int GROUP_HISTORY_ENVELOPE_AAD_VERSION = 1;
    private static final int DIRECT_ENVELOPE_AAD_VERSION = 1;

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatHistoryKeyRepository chatHistoryKeyRepository;
    private final ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository;
    private final ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository;
    private final ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private final UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private final DeviceKeyValidationService deviceKeyValidationService;
    private final DeviceEnvelopeCounterService deviceEnvelopeCounterService;
    private final ChatHistoryBackfillStatusService chatHistoryBackfillStatusService;
    private final ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;
    private final ObjectMapper objectMapper;

    public ChatGroupHistoryKeyService(
            AuthService authService,
            ChatService chatService,
            ChatHistoryKeyRepository chatHistoryKeyRepository,
            ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository,
            ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository,
            ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository,
            ChatParticipantRepository chatParticipantRepository,
            UserEncryptionDeviceRepository userEncryptionDeviceRepository,
            UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository,
            DeviceKeyValidationService deviceKeyValidationService,
            DeviceEnvelopeCounterService deviceEnvelopeCounterService,
            ChatHistoryBackfillStatusService chatHistoryBackfillStatusService,
            ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatHistoryKeyRepository = chatHistoryKeyRepository;
        this.chatHistoryKeyAccessRepository = chatHistoryKeyAccessRepository;
        this.chatHistoryKeyUserAccessRepository = chatHistoryKeyUserAccessRepository;
        this.chatHistoryKeyEscrowRepository = chatHistoryKeyEscrowRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.userEncryptionDeviceRepository = userEncryptionDeviceRepository;
        this.userEncryptionSignedPrekeyRepository = userEncryptionSignedPrekeyRepository;
        this.deviceKeyValidationService = deviceKeyValidationService;
        this.deviceEnvelopeCounterService = deviceEnvelopeCounterService;
        this.chatHistoryBackfillStatusService = chatHistoryBackfillStatusService;
        this.chatHistoryKeyEscrowCryptoService = chatHistoryKeyEscrowCryptoService;
        this.objectMapper = objectMapper;
    }

    public List<GroupHistoryKeyAccessResponse> listOwnGroupHistoryKeys(
            String username,
            UUID chatId,
            String deviceId
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
        Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId = new LinkedHashMap<>();
        mergeUserHistoryKeyAccesses(accessesByHistoryKeyId, chatId, currentUser.getId());
        UserEncryptionDevice recipientDevice = requireOwnedHistoryLookupDevice(currentUser.getId(), deviceId);
        chatHistoryKeyAccessRepository
                .findAllByChatIdAndRecipientUserIdAndRecipientDeviceIdOrderByCreatedAtAsc(
                        chatId,
                        currentUser.getId(),
                        recipientDevice.getId()
                )
                .stream()
                .forEach(access -> accessesByHistoryKeyId.put(
                        access.getHistoryKeyId(),
                        new GroupHistoryKeyAccessResponse(
                                access.getHistoryKeyId().toString(),
                                access.getWrappedKeyPayloadJson(),
                                null,
                                access.getCreatedAt(),
                                access.getUpdatedAt()
                        )
                ));

        mergeEscrowHistoryKeyAccesses(accessesByHistoryKeyId, chatId, room, membership);

        return List.copyOf(accessesByHistoryKeyId.values());
    }

    @Transactional
    public GroupHistoryKeyResponse upsertGroupHistoryKey(
            String username,
            String accessToken,
            UUID chatId,
            UpsertGroupHistoryKeyRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession =
                authService.requireAuthenticatedSession(username, accessToken);
        ChatRoom room = chatService.requireChatMembership(chatId, authenticatedSession.user());

        UUID historyKeyId = parseUuid(request.historyKeyId(), "Group history key id is invalid");
        Instant now = Instant.now();
        List<UserAccount> participants = chatService.findParticipants(chatId);
        Map<String, UserAccount> participantsByUserId = participants.stream()
                .collect(Collectors.toMap(user -> user.getId().toString(), Function.identity()));
        Map<String, UserEncryptionDevice> knownDevicesById = visibleDevices(
                        userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(
                                participants.stream().map(UserAccount::getId).toList()
                        )
                ).stream()
                .collect(Collectors.toMap(device -> device.getId().toString(), Function.identity()));
        Map<String, String> wrappedKeysByRecipientDeviceId = request.wrappedKeysByRecipientDeviceId() == null
                ? Map.of()
                : request.wrappedKeysByRecipientDeviceId();
        Map<String, String> wrappedKeysByRecipientUserId = request.wrappedKeysByRecipientUserId() == null
                ? Map.of()
                : request.wrappedKeysByRecipientUserId();
        if (wrappedKeysByRecipientDeviceId.isEmpty() && wrappedKeysByRecipientUserId.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group history key access is required");
        }
        if (!knownDevicesById.keySet().containsAll(wrappedKeysByRecipientDeviceId.keySet())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history key access contains unknown recipient devices"
            );
        }
        if (!participantsByUserId.keySet().containsAll(wrappedKeysByRecipientUserId.keySet())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history key access contains unknown recipient users"
            );
        }

        ChatHistoryKey historyKey = chatHistoryKeyRepository.findById(historyKeyId)
                .map(existing -> {
                    if (!existing.getChatId().equals(chatId)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Group history key does not belong to this chat"
                        );
                    }
                    return existing;
                })
                .orElseGet(() -> {
                    Set<String> expectedRecipientDeviceIds = knownDevicesById.keySet();
                    Set<String> expectedRecipientUserIds = participantsByUserId.keySet();
                    if (!wrappedKeysByRecipientDeviceId.isEmpty()
                            && !wrappedKeysByRecipientDeviceId.keySet().equals(expectedRecipientDeviceIds)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Initial group history key must include every active participant device"
                        );
                    }
                    if (!wrappedKeysByRecipientUserId.isEmpty()
                            && !wrappedKeysByRecipientUserId.keySet().equals(expectedRecipientUserIds)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Initial group history key must include every participant user"
                        );
                    }
                    return chatHistoryKeyRepository.save(new ChatHistoryKey(
                            historyKeyId,
                            chatId,
                            authenticatedSession.user().getId(),
                            now
                    ));
                });

        UserEncryptionDevice senderDevice = null;
        Map<UUID, DeviceEnvelopeCounterService.EnvelopeCounterInput> envelopesByRecipientDeviceId = new LinkedHashMap<>();
        List<ChatHistoryKeyAccess> accessesToSave = new java.util.ArrayList<>();
        List<ChatHistoryKeyUserAccess> userAccessesToSave = new java.util.ArrayList<>();
        for (Map.Entry<String, String> entry : new LinkedHashMap<>(wrappedKeysByRecipientDeviceId).entrySet()) {
            UserEncryptionDevice recipientDevice = knownDevicesById.get(entry.getKey());
            if (recipientDevice == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key access contains unknown recipient devices"
                );
            }

            DirectEnvelope envelope = parseDirectEnvelope(entry.getValue());
            if (!envelope.senderUserId().equals(authenticatedSession.user().getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key sender must match the current user"
                );
            }
            if (!envelope.recipientDeviceId().equals(recipientDevice.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key recipient device is invalid"
                );
            }

            if (senderDevice == null) {
                senderDevice = knownDevicesById.get(envelope.senderDeviceId().toString());
                if (senderDevice == null || !senderDevice.getUserId().equals(authenticatedSession.user().getId())) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Group history key sender device is invalid"
                    );
                }
                if (!senderDevice.getIdentityKey().equals(envelope.senderIdentityKey())
                        || !senderDevice.getIdentitySignatureKey().equals(envelope.senderIdentitySignatureKey())) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Group history key sender identity does not match the registered device"
                    );
                }
            } else if (!senderDevice.getId().equals(envelope.senderDeviceId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key must use the same sender device for all recipient envelopes"
                );
            }

            UserEncryptionSignedPrekey recipientSignedPrekey = userEncryptionSignedPrekeyRepository
                    .findActiveByDeviceIdAndKeyId(
                            recipientDevice.getId(),
                            envelope.recipientSignedPrekeyId(),
                            now
                    )
                    .orElse(null);
            if (recipientSignedPrekey == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key recipient prekey is stale"
                );
            }

            envelopesByRecipientDeviceId.put(
                    recipientDevice.getId(),
                    new DeviceEnvelopeCounterService.EnvelopeCounterInput(
                            envelope.ratchetPublicKey(),
                            envelope.initiatorEphemeralPublicKey(),
                            envelope.messageCounter()
                    )
            );

            ChatHistoryKeyAccess access = chatHistoryKeyAccessRepository
                    .findByHistoryKeyIdAndRecipientDeviceId(historyKey.getId(), recipientDevice.getId())
                    .map(existing -> {
                        existing.update(
                                entry.getValue(),
                                authenticatedSession.user().getId(),
                                now
                        );
                        return existing;
                    })
                    .orElseGet(() -> new ChatHistoryKeyAccess(
                            UUID.randomUUID(),
                            historyKey.getId(),
                            recipientDevice.getUserId(),
                            recipientDevice.getId(),
                            entry.getValue(),
                            authenticatedSession.user().getId(),
                            now,
                            now
                    ));
            accessesToSave.add(access);
        }
        for (Map.Entry<String, String> entry : new LinkedHashMap<>(wrappedKeysByRecipientUserId).entrySet()) {
            UserAccount recipientUser = participantsByUserId.get(entry.getKey());
            if (recipientUser == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key access contains unknown recipient users"
                );
            }

            ChatHistoryKeyUserAccess access = chatHistoryKeyUserAccessRepository
                    .findByHistoryKeyIdAndRecipientUserId(historyKey.getId(), recipientUser.getId())
                    .map(existing -> {
                        existing.update(
                                entry.getValue(),
                                authenticatedSession.user().getId(),
                                now
                        );
                        return existing;
                    })
                    .orElseGet(() -> new ChatHistoryKeyUserAccess(
                            UUID.randomUUID(),
                            historyKey.getId(),
                            recipientUser.getId(),
                            entry.getValue(),
                            authenticatedSession.user().getId(),
                            now,
                            now
                    ));
            userAccessesToSave.add(access);
        }

        if (senderDevice != null && !envelopesByRecipientDeviceId.isEmpty()) {
            deviceEnvelopeCounterService.validateAndAdvanceCounters(
                    senderDevice.getId(),
                    envelopesByRecipientDeviceId
            );
        }
        for (ChatHistoryKeyAccess access : accessesToSave) {
            chatHistoryKeyAccessRepository.save(access);
        }
        for (ChatHistoryKeyUserAccess access : userAccessesToSave) {
            chatHistoryKeyUserAccessRepository.save(access);
        }
        upsertEscrowGrantPayload(chatId, historyKey, request.serverEscrowGrantPayloadJson(), now);
        chatHistoryBackfillStatusService.refreshCoverage(
                chatId,
                java.util.stream.Stream.concat(
                                accessesToSave.stream().map(ChatHistoryKeyAccess::getRecipientUserId),
                                userAccessesToSave.stream().map(ChatHistoryKeyUserAccess::getRecipientUserId)
                        )
                        .distinct()
                        .toList()
        );
        chatHistoryBackfillStatusService.refreshCoverage(chatId);

        return new GroupHistoryKeyResponse(historyKey.getId().toString(), historyKey.getCreatedAt());
    }

    public ValidatedGroupMessageHistoryEnvelope validateMessageHistoryEnvelope(
            ChatRoom room,
            String serializedEnvelope
    ) {
        if (serializedEnvelope == null || serializedEnvelope.isBlank()) {
            return null;
        }

        try {
            JsonNode envelope = objectMapper.readTree(serializedEnvelope);
            if (envelope.path("aadVersion").asInt(-1) != GROUP_HISTORY_ENVELOPE_AAD_VERSION) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group history envelope must use current authenticated format"
                );
            }

            String historyKeyId = envelope.path("historyKeyId").asText();
            String ciphertext = envelope.path("ciphertext").asText();
            String iv = envelope.path("iv").asText();
            if (historyKeyId == null || historyKeyId.isBlank()
                    || ciphertext == null || ciphertext.isBlank()
                    || iv == null || iv.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group history envelope is incomplete"
                );
            }

            validateBase64(iv, "Encrypted group history envelope is malformed");
            validateBase64(ciphertext, "Encrypted group history envelope is malformed");
            if (Base64.getDecoder().decode(iv).length != 12) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted group history envelope is malformed"
                );
            }

            UUID parsedHistoryKeyId = parseUuid(
                    historyKeyId,
                    "Encrypted group history envelope is malformed"
            );
            chatHistoryKeyRepository.findByIdAndChatId(parsedHistoryKeyId, room.getId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Encrypted group history envelope history key is invalid"
                    ));
            return new ValidatedGroupMessageHistoryEnvelope(parsedHistoryKeyId, serializedEnvelope);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted group history envelope is malformed"
            );
        }
    }

    private UserEncryptionDevice requireOwnedHistoryLookupDevice(UUID currentUserId, String deviceId) {
        UUID parsedDeviceId = parseUuid(deviceId, "Encryption device id is invalid");
        UserEncryptionDevice device = userEncryptionDeviceRepository.findById(parsedDeviceId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Encryption device was not found"
                ));
        if (!device.getUserId().equals(currentUserId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Encryption device was not found"
            );
        }
        return device;
    }

    private void mergeUserHistoryKeyAccesses(
            Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId,
            UUID chatId,
            UUID currentUserId
    ) {
        chatHistoryKeyUserAccessRepository
                .findAllByChatIdAndRecipientUserIdOrderByCreatedAtAsc(chatId, currentUserId)
                .forEach(access -> accessesByHistoryKeyId.put(
                        access.getHistoryKeyId(),
                        new GroupHistoryKeyAccessResponse(
                                access.getHistoryKeyId().toString(),
                                access.getWrappedKeyPayloadJson(),
                                null,
                                access.getCreatedAt(),
                                access.getUpdatedAt()
                        )
                ));
    }

    private UUID parseUuid(String value, String errorMessage) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorMessage);
        }
    }

    private List<UserEncryptionDevice> visibleDevices(List<UserEncryptionDevice> devices) {
        return devices.stream()
                .filter(deviceKeyValidationService::hasValidCurrentSignedPrekey)
                .toList();
    }

    private void upsertEscrowGrantPayload(
            UUID chatId,
            ChatHistoryKey historyKey,
            String serverEscrowGrantPayloadJson,
            Instant now
    ) {
        if (serverEscrowGrantPayloadJson == null || serverEscrowGrantPayloadJson.isBlank()) {
            return;
        }

        GroupHistoryKeyGrantPayload grantPayload = parseGroupHistoryGrantPayload(serverEscrowGrantPayloadJson);
        if (!Objects.equals(grantPayload.chatId(), chatId)
                || !Objects.equals(grantPayload.historyKeyId(), historyKey.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history escrow payload does not match the uploaded history key"
            );
        }

        String encryptedGrantPayloadJson = chatHistoryKeyEscrowCryptoService.encryptGrantPayload(
                serverEscrowGrantPayloadJson
        );
        chatHistoryKeyEscrowRepository.findByHistoryKeyId(historyKey.getId())
                .map(existing -> {
                    existing.updateEncryptedGrantPayloadJson(encryptedGrantPayloadJson, now);
                    return existing;
                })
                .orElseGet(() -> chatHistoryKeyEscrowRepository.save(new ChatHistoryKeyEscrow(
                        UUID.randomUUID(),
                        historyKey.getId(),
                        chatId,
                        encryptedGrantPayloadJson,
                        now,
                        now
                )));
    }

    private DirectEnvelope parseDirectEnvelope(String serializedEnvelope) {
        try {
            JsonNode envelope = objectMapper.readTree(serializedEnvelope);
            if (envelope.path("aadVersion").asInt(-1) != DIRECT_ENVELOPE_AAD_VERSION) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key envelope must use current authenticated format"
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
                        "Group history key envelope is incomplete"
                );
            }

            int recipientSignedPrekeyId = envelope.path("recipientSignedPrekeyId").asInt();
            int messageCounter = envelope.path("messageCounter").asInt();
            if (recipientSignedPrekeyId < 0 || messageCounter < 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key envelope is incomplete"
                );
            }

            deviceKeyValidationService.validateDirectEnvelopeTransportKeys(
                    initiatorEphemeralPublicKey,
                    ratchetPublicKey
            );
            validateBase64(iv, "Group history key envelope is malformed");
            validateBase64(ciphertext, "Group history key envelope is malformed");
            if (Base64.getDecoder().decode(iv).length != 12) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history key envelope is malformed"
                );
            }

            return new DirectEnvelope(
                    UUID.fromString(senderUserId),
                    UUID.fromString(senderDeviceId),
                    UUID.fromString(recipientDeviceId),
                    senderIdentityKey,
                    senderIdentitySignatureKey,
                    initiatorEphemeralPublicKey,
                    ratchetPublicKey,
                    recipientSignedPrekeyId,
                    messageCounter
            );
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history key envelope is malformed"
            );
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history key envelope is malformed"
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

    private void mergeEscrowHistoryKeyAccesses(
            Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId,
            UUID chatId,
            ChatRoom room,
            ChatParticipant membership
    ) {
        List<ChatHistoryKeyEscrow> escrowRecords;
        if (room.isDirect()) {
            escrowRecords = chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        } else if (room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            escrowRecords = chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        } else {
            escrowRecords = chatHistoryKeyEscrowRepository
                    .findAllByChatIdAndHistoryKeyCreatedAtOnOrAfterOrderByHistoryKeyCreatedAtAsc(
                            chatId,
                            membership.getJoinedAt()
                    );
        }

        for (ChatHistoryKeyEscrow escrow : escrowRecords) {
            accessesByHistoryKeyId.computeIfAbsent(escrow.getHistoryKeyId(), ignored ->
                    new GroupHistoryKeyAccessResponse(
                            escrow.getHistoryKeyId().toString(),
                            "",
                            chatHistoryKeyEscrowCryptoService.decryptGrantPayload(
                                    escrow.getEncryptedGrantPayloadJson()
                            ),
                            escrow.getCreatedAt(),
                            escrow.getUpdatedAt()
                    ));
        }
    }

    private GroupHistoryKeyGrantPayload parseGroupHistoryGrantPayload(String serializedPayload) {
        try {
            JsonNode payload = objectMapper.readTree(serializedPayload);
            if (payload.path("aadVersion").asInt(-1) != 1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history escrow payload must use current authenticated format"
                );
            }

            String chatId = payload.path("chatId").asText();
            String historyKeyId = payload.path("historyKeyId").asText();
            String historyKey = payload.path("historyKey").asText();
            String createdAt = payload.path("createdAt").asText();
            if (chatId == null || chatId.isBlank()
                    || historyKeyId == null || historyKeyId.isBlank()
                    || historyKey == null || historyKey.isBlank()
                    || createdAt == null || createdAt.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history escrow payload is incomplete"
                );
            }

            return new GroupHistoryKeyGrantPayload(
                    parseUuid(chatId, "Group history escrow payload is malformed"),
                    parseUuid(historyKeyId, "Group history escrow payload is malformed"),
                    historyKey,
                    Instant.parse(createdAt)
            );
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history escrow payload is malformed"
            );
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history escrow payload is malformed"
            );
        }
    }

    public record ValidatedGroupMessageHistoryEnvelope(
            UUID historyKeyId,
            String serializedEnvelope
    ) {
    }

    private record DirectEnvelope(
            UUID senderUserId,
            UUID senderDeviceId,
            UUID recipientDeviceId,
            String senderIdentityKey,
            String senderIdentitySignatureKey,
            String initiatorEphemeralPublicKey,
            String ratchetPublicKey,
            int recipientSignedPrekeyId,
            int messageCounter
    ) {
    }

    private record GroupHistoryKeyGrantPayload(
            UUID chatId,
            UUID historyKeyId,
            String historyKey,
            Instant createdAt
    ) {
    }
}
