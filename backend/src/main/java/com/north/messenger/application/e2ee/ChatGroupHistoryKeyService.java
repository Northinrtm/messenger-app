package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ActiveGroupHistoryKeyAccessEventResponse;
import com.north.messenger.api.dto.GroupHistoryKeyAccessResponse;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.domain.model.ChatHistoryKey;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatHistoryKeyUserAccess;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionAccountKey;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyUserAccessRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatGroupHistoryKeyService {

    private static final int GROUP_HISTORY_KEY_GRANT_AAD_VERSION = 1;
    private static final String GROUP_HISTORY_KEY_GRANT_CONTEXT = "north.group-history-key-grant.v1";
    private static final int GROUP_HISTORY_KEY_BYTES = 32;
    private static final String MISSING_ACCOUNT_ENCRYPTION_MESSAGE =
            "Encrypted chat is unavailable because some participants have not initialized account encryption yet";

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatHistoryKeyRepository chatHistoryKeyRepository;
    private final ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository;
    private final ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private final UserDeletedChatRepository userDeletedChatRepository;
    private final ChatHistoryBackfillStatusService chatHistoryBackfillStatusService;
    private final ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;
    private final AccountKeyWrapCryptoService accountKeyWrapCryptoService;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public ChatGroupHistoryKeyService(
            AuthService authService,
            ChatService chatService,
            ChatRoomRepository chatRoomRepository,
            ChatHistoryKeyRepository chatHistoryKeyRepository,
            ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository,
            ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository,
            ChatParticipantRepository chatParticipantRepository,
            UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository,
            UserDeletedChatRepository userDeletedChatRepository,
            ChatHistoryBackfillStatusService chatHistoryBackfillStatusService,
            ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService,
            AccountKeyWrapCryptoService accountKeyWrapCryptoService,
            RealtimeMessagingGateway realtimeMessagingGateway,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatHistoryKeyRepository = chatHistoryKeyRepository;
        this.chatHistoryKeyUserAccessRepository = chatHistoryKeyUserAccessRepository;
        this.chatHistoryKeyEscrowRepository = chatHistoryKeyEscrowRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.userEncryptionAccountKeyRepository = userEncryptionAccountKeyRepository;
        this.userDeletedChatRepository = userDeletedChatRepository;
        this.chatHistoryBackfillStatusService = chatHistoryBackfillStatusService;
        this.chatHistoryKeyEscrowCryptoService = chatHistoryKeyEscrowCryptoService;
        this.accountKeyWrapCryptoService = accountKeyWrapCryptoService;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
    }

    public List<GroupHistoryKeyAccessResponse> listOwnGroupHistoryKeys(
            String username,
            UUID chatId,
            String cursor
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        GroupHistorySyncCursor syncCursor = parseSyncCursor(cursor);

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
        Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId = new LinkedHashMap<>();
        mergeUserHistoryKeyAccesses(accessesByHistoryKeyId, chatId, currentUser.getId(), syncCursor);
        mergeEscrowHistoryKeyAccesses(accessesByHistoryKeyId, chatId, room, membership, syncCursor);

        return List.copyOf(accessesByHistoryKeyId.values());
    }

    @Transactional
    public GroupHistoryKeyAccessResponse getOwnActiveGroupHistoryKey(
            String username,
            UUID chatId
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        UUID activeHistoryKeyId = ensureActiveHistoryKeyId(room, currentUser.getId());
        if (activeHistoryKeyId == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active encrypted chat history key was not found");
        }

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
        return resolveOwnHistoryKeyAccess(chatId, room, membership, currentUser.getId(), activeHistoryKeyId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Active encrypted chat history key was not found"
                ));
    }

    private UUID ensureActiveHistoryKeyId(ChatRoom room, UUID currentUserId) {
        UUID activeHistoryKeyId = room.getActiveHistoryKeyId();
        if (activeHistoryKeyId != null) {
            return activeHistoryKeyId;
        }

        GroupHistoryKeyResponse bootstrapResponse = rotateActiveHistoryKeyForParticipants(
                room,
                chatService.findParticipants(room.getId()),
                currentUserId
        );
        if (bootstrapResponse == null) {
            return null;
        }
        return room.getActiveHistoryKeyId();
    }

    @Transactional
    public GroupHistoryKeyResponse rotateOwnActiveHistoryKey(
            String username,
            String accessToken,
            UUID chatId
    ) {
        AuthService.AuthenticatedSession authenticatedSession =
                authService.requireAuthenticatedSession(username, accessToken);
        ChatRoom room = chatService.requireChatMembership(chatId, authenticatedSession.user());
        if (!room.isDirect()) {
            chatService.requireGroupModeratorOrOwnerAccess(room, authenticatedSession.user());
        }

        GroupHistoryKeyResponse response = rotateActiveHistoryKeyForParticipants(
                room,
                chatService.findParticipants(chatId),
                authenticatedSession.user().getId()
        );
        if (response == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Active encrypted chat history key was not found"
            );
        }
        return response;
    }

    public void validateMessageHistoryKey(ChatRoom room, UUID historyKeyId) {
        ChatHistoryKey historyKey = chatHistoryKeyRepository.findByIdAndChatId(historyKeyId, room.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Encrypted chat epoch envelope history key is invalid"
                ));

        UUID activeHistoryKeyId = room.getActiveHistoryKeyId();
        if (activeHistoryKeyId != null && !activeHistoryKeyId.equals(historyKey.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Encrypted chat epoch history key is no longer active"
            );
        }
    }

    @Transactional
    public void backfillHistoryAccessFromEscrow(
            UUID chatId,
            Set<UUID> recipientUserIds,
            UUID primaryGrantorUserId
    ) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        ChatRoom room = chatRoomRepository.findById(chatId).orElse(null);
        if (room == null || room.isDirect()) {
            return;
        }

        Map<UUID, ChatParticipant> membershipsByUserId = chatParticipantRepository
                .findAllByChatIdOrderByJoinedAtAsc(chatId)
                .stream()
                .collect(Collectors.toMap(ChatParticipant::getUserId, Function.identity()));
        Map<UUID, UserEncryptionAccountKey> accountKeysByUserId = resolveAccountPublicKeys(membershipsByUserId.keySet());
        Instant now = Instant.now();

        for (UUID recipientUserId : recipientUserIds) {
            ChatParticipant membership = membershipsByUserId.get(recipientUserId);
            if (membership == null) {
                continue;
            }

            boolean shouldBackfill = shouldBackfillFromEscrow(room, membership);
            if (!shouldBackfill) {
                continue;
            }

            UserEncryptionAccountKey accountKey = accountKeysByUserId.get(recipientUserId);
            if (accountKey == null || accountKey.getPublicKey() == null || accountKey.getPublicKey().isBlank()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, MISSING_ACCOUNT_ENCRYPTION_MESSAGE);
            }

            List<ChatHistoryKeyEscrow> escrowRecords = resolveEscrowRecordsForMembership(chatId, room, membership);
            if (escrowRecords.isEmpty()) {
                continue;
            }
            Map<UUID, ChatHistoryKeyUserAccess> existingAccessesByHistoryKeyId =
                    findExistingAccessesByHistoryKeyId(
                            recipientUserId,
                            escrowRecords.stream().map(ChatHistoryKeyEscrow::getHistoryKeyId).toList()
                    );
            List<ChatHistoryKeyUserAccess> accessesToSave = new java.util.ArrayList<>();
            for (ChatHistoryKeyEscrow escrow : escrowRecords) {
                if (existingAccessesByHistoryKeyId.containsKey(escrow.getHistoryKeyId())) {
                    continue;
                }

                String grantPayloadJson = chatHistoryKeyEscrowCryptoService.decryptGrantPayload(
                        escrow.getEncryptedGrantPayloadJson()
                );
                GroupHistoryKeyGrantPayload grantPayload = parseGroupHistoryGrantPayload(grantPayloadJson);
                if (!Objects.equals(grantPayload.chatId(), chatId)
                        || !Objects.equals(grantPayload.historyKeyId(), escrow.getHistoryKeyId())) {
                    continue;
                }

                accessesToSave.add(new ChatHistoryKeyUserAccess(
                        UUID.randomUUID(),
                        escrow.getHistoryKeyId(),
                        recipientUserId,
                        accountKeyWrapCryptoService.wrapHistoryKeyGrant(
                                accountKey.getPublicKey(),
                                recipientUserId,
                                accountKey.getAccountKeyVersion(),
                                grantPayloadJson
                        ),
                        resolveGrantorUserId(primaryGrantorUserId, room),
                        now,
                        now
                ));
            }

            if (!accessesToSave.isEmpty()) {
                chatHistoryKeyUserAccessRepository.saveAll(accessesToSave);
            }
        }

        chatHistoryBackfillStatusService.refreshCoverage(chatId, List.copyOf(recipientUserIds));
        chatHistoryBackfillStatusService.refreshCoverage(chatId);
    }

    @Transactional
    public void refreshVisibleHistoryAccessForRecipient(UUID recipientUserId) {
        if (recipientUserId == null) {
            return;
        }

        UserEncryptionAccountKey accountKey = resolveAccountPublicKeys(Set.of(recipientUserId)).get(recipientUserId);
        if (accountKey == null || accountKey.getPublicKey() == null || accountKey.getPublicKey().isBlank()) {
            return;
        }

        Instant now = Instant.now();
        Set<UUID> touchedChatIds = new java.util.LinkedHashSet<>();
        for (ChatParticipant membership : chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(recipientUserId)) {
            ChatRoom room = chatRoomRepository.findById(membership.getChatId()).orElse(null);
            if (room == null) {
                continue;
            }

            List<ChatHistoryKeyEscrow> escrowRecords = resolveEscrowRecordsVisibleToMembership(
                    membership.getChatId(),
                    room,
                    membership
            );
            if (escrowRecords.isEmpty()) {
                continue;
            }

            Map<UUID, ChatHistoryKeyUserAccess> existingAccessesByHistoryKeyId =
                    findExistingAccessesByHistoryKeyId(
                            recipientUserId,
                            escrowRecords.stream().map(ChatHistoryKeyEscrow::getHistoryKeyId).toList()
                    );
            List<ChatHistoryKeyUserAccess> accessesToSave = new java.util.ArrayList<>();
            for (ChatHistoryKeyEscrow escrow : escrowRecords) {
                String grantPayloadJson = chatHistoryKeyEscrowCryptoService.decryptGrantPayload(
                        escrow.getEncryptedGrantPayloadJson()
                );
                GroupHistoryKeyGrantPayload grantPayload = parseGroupHistoryGrantPayload(grantPayloadJson);
                if (!Objects.equals(grantPayload.chatId(), membership.getChatId())
                        || !Objects.equals(grantPayload.historyKeyId(), escrow.getHistoryKeyId())) {
                    continue;
                }

                UUID grantedByUserId = chatHistoryKeyRepository.findById(escrow.getHistoryKeyId())
                        .map(ChatHistoryKey::getCreatedByUserId)
                        .orElseGet(() -> resolveGrantorUserId(recipientUserId, room));
                String wrappedGrantPayload = accountKeyWrapCryptoService.wrapHistoryKeyGrant(
                        accountKey.getPublicKey(),
                        recipientUserId,
                        accountKey.getAccountKeyVersion(),
                        grantPayloadJson
                );
                ChatHistoryKeyUserAccess access = Optional.ofNullable(
                        existingAccessesByHistoryKeyId.get(escrow.getHistoryKeyId())
                ).map(existing -> {
                    existing.update(
                            wrappedGrantPayload,
                            grantedByUserId,
                            now
                    );
                    return existing;
                }).orElseGet(() -> new ChatHistoryKeyUserAccess(
                        UUID.randomUUID(),
                        escrow.getHistoryKeyId(),
                        recipientUserId,
                        wrappedGrantPayload,
                        grantedByUserId,
                        now,
                        now
                ));
                accessesToSave.add(access);
            }

            if (!accessesToSave.isEmpty()) {
                chatHistoryKeyUserAccessRepository.saveAll(accessesToSave);
                touchedChatIds.add(membership.getChatId());
            }
        }

        touchedChatIds.forEach(chatId ->
                chatHistoryBackfillStatusService.refreshCoverage(chatId, List.of(recipientUserId))
        );
        touchedChatIds.forEach(chatId ->
                publishActiveHistoryKeyBroadcastRequest(chatId, Set.of(recipientUserId))
        );
    }

    @Transactional
    public void rotateActiveHistoryKeyForCurrentParticipants(
            UUID chatId,
            UUID primaryGrantorUserId
    ) {
        if (chatId == null) {
            return;
        }

        ChatRoom room = chatRoomRepository.findById(chatId).orElse(null);
        if (room == null) {
            return;
        }

        rotateActiveHistoryKeyForParticipants(room, chatService.findParticipants(chatId), primaryGrantorUserId);
    }

    private void mergeUserHistoryKeyAccesses(
            Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId,
            UUID chatId,
            UUID currentUserId,
            GroupHistorySyncCursor cursor
    ) {
        List<ChatHistoryKeyUserAccess> accesses = cursor == null
                ? chatHistoryKeyUserAccessRepository.findAllByChatIdAndRecipientUserIdOrderByCreatedAtAsc(
                        chatId,
                        currentUserId
                )
                : chatHistoryKeyUserAccessRepository
                        .findAllByChatIdAndRecipientUserIdAndUpdatedAtOnOrAfterOrderByUpdatedAtAscHistoryKeyIdAsc(
                                chatId,
                                currentUserId,
                                cursor.updatedAt()
                        );

        accesses.stream()
                .filter(access -> isAfterCursor(access.getUpdatedAt(), access.getHistoryKeyId(), cursor))
                .forEach(access -> accessesByHistoryKeyId.put(access.getHistoryKeyId(), toUserAccessResponse(access)));
    }

    private void mergeEscrowHistoryKeyAccesses(
            Map<UUID, GroupHistoryKeyAccessResponse> accessesByHistoryKeyId,
            UUID chatId,
            ChatRoom room,
            ChatParticipant membership,
            GroupHistorySyncCursor cursor
    ) {
        resolveEscrowRecordsVisibleToMembership(chatId, room, membership).stream()
                .filter(escrow -> isAfterCursor(escrow.getUpdatedAt(), escrow.getHistoryKeyId(), cursor))
                .forEach(escrow -> accessesByHistoryKeyId.put(escrow.getHistoryKeyId(), toEscrowAccessResponse(escrow)));
    }

    private Map<UUID, UserEncryptionAccountKey> resolveAccountPublicKeys(Set<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }

        return userEncryptionAccountKeyRepository.findAllByUserIdIn(List.copyOf(userIds)).stream()
                .collect(Collectors.toMap(
                        UserEncryptionAccountKey::getUserId,
                        Function.identity()
                ));
    }

    private List<ChatHistoryKeyEscrow> resolveEscrowRecordsForMembership(
            UUID chatId,
            ChatRoom room,
            ChatParticipant membership
    ) {
        if (shouldBackfillFromEscrow(room, membership)) {
            return chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        }
        return List.of();
    }

    private List<ChatHistoryKeyEscrow> resolveEscrowRecordsVisibleToMembership(
            UUID chatId,
            ChatRoom room,
            ChatParticipant membership
    ) {
        if (room.isDirect()) {
            return chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        }
        if (shouldBackfillFromEscrow(room, membership)) {
            return chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        }
        return chatHistoryKeyEscrowRepository
                .findAllByChatIdAndHistoryKeyCreatedAtOnOrAfterOrderByHistoryKeyCreatedAtAsc(
                        chatId,
                        membership.getJoinedAt()
                );
    }

    private boolean shouldBackfillFromEscrow(ChatRoom room, ChatParticipant membership) {
        return room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null;
    }

    private void requireAccountPublicKeysForParticipants(
            List<UserAccount> participants,
            Map<UUID, UserEncryptionAccountKey> accountKeysByUserId
    ) {
        boolean hasMissingAccountKeys = participants.stream()
                .map(UserAccount::getId)
                .anyMatch(userId -> {
                    UserEncryptionAccountKey accountKey = accountKeysByUserId.get(userId);
                    return accountKey == null
                            || accountKey.getPublicKey() == null
                            || accountKey.getPublicKey().isBlank();
                });
        if (hasMissingAccountKeys) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, MISSING_ACCOUNT_ENCRYPTION_MESSAGE);
        }
    }

    private UUID resolveGrantorUserId(UUID primaryGrantorUserId, ChatRoom room) {
        if (primaryGrantorUserId != null) {
            return primaryGrantorUserId;
        }
        if (room != null && room.getOwnerUserId() != null) {
            return room.getOwnerUserId();
        }
        throw new IllegalStateException("A group history grantor user id is required");
    }

    private ChatHistoryKeyUserAccess buildRotatedAccess(
            UUID historyKeyId,
            UUID recipientUserId,
            UserEncryptionAccountKey accountKey,
            String grantPayloadJson,
            UUID grantedByUserId,
            Instant now
    ) {
        if (accountKey == null || accountKey.getPublicKey() == null || accountKey.getPublicKey().isBlank()) {
            return null;
        }

        return new ChatHistoryKeyUserAccess(
                UUID.randomUUID(),
                historyKeyId,
                recipientUserId,
                accountKeyWrapCryptoService.wrapHistoryKeyGrant(
                        accountKey.getPublicKey(),
                        recipientUserId,
                        accountKey.getAccountKeyVersion(),
                        grantPayloadJson
                ),
                grantedByUserId,
                now,
                now
        );
    }

    private GroupHistoryKeyResponse rotateActiveHistoryKeyForParticipants(
            ChatRoom room,
            List<UserAccount> participants,
            UUID primaryGrantorUserId
    ) {
        if (room == null || participants == null || participants.isEmpty()) {
            return null;
        }

        Map<UUID, UserEncryptionAccountKey> accountKeysByUserId = resolveAccountPublicKeys(
                participants.stream().map(UserAccount::getId).collect(Collectors.toSet())
        );
        requireAccountPublicKeysForParticipants(participants, accountKeysByUserId);
        Instant now = Instant.now();
        UUID grantorUserId = resolveGrantorUserId(primaryGrantorUserId, room);
        UUID historyKeyId = UUID.randomUUID();
        String historyKeyMaterial = generateHistoryKeyMaterial();
        String grantPayloadJson = serializeGroupHistoryGrantPayload(
                room.getId(),
                historyKeyId,
                historyKeyMaterial,
                room.getMembershipVersion(),
                room.isDirect() ? null : room.getPrejoinHistoryPolicy(),
                now
        );

        List<ChatHistoryKeyUserAccess> accessesToSave = participants.stream()
                .map(participant -> buildRotatedAccess(
                        historyKeyId,
                        participant.getId(),
                        accountKeysByUserId.get(participant.getId()),
                        grantPayloadJson,
                        grantorUserId,
                        now
                ))
                .filter(Objects::nonNull)
                .toList();
        if (accessesToSave.isEmpty()) {
            return null;
        }

        ChatHistoryKey historyKey = chatHistoryKeyRepository.save(new ChatHistoryKey(
                historyKeyId,
                room.getId(),
                grantorUserId,
                now
        ));
        chatHistoryKeyUserAccessRepository.saveAll(accessesToSave);
        upsertEscrowGrantPayload(room.getId(), historyKey, grantPayloadJson, now);
        room.updateActiveHistoryKeyId(historyKeyId);
        chatRoomRepository.save(room);
        chatHistoryBackfillStatusService.refreshCoverage(room.getId());
        publishActiveHistoryKeyBroadcastRequest(
                room.getId(),
                participants.stream().map(UserAccount::getId).collect(Collectors.toSet())
        );
        return new GroupHistoryKeyResponse(historyKey.getId().toString(), historyKey.getCreatedAt());
    }

    private void markActiveHistoryKeyIfUnset(ChatRoom room, UUID historyKeyId) {
        if (room.getActiveHistoryKeyId() != null) {
            return;
        }

        room.updateActiveHistoryKeyId(historyKeyId);
        chatRoomRepository.save(room);
    }

    private UUID parseUuid(String value, String errorMessage) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorMessage);
        }
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

    private String serializeGroupHistoryGrantPayload(
            UUID chatId,
            UUID historyKeyId,
            String historyKey,
            long membershipVersion,
            ChatPrejoinHistoryPolicy historyPolicy,
            Instant createdAt
    ) {
        try {
            return objectMapper.writeValueAsString(objectMapper.createObjectNode()
                    .put("aadVersion", GROUP_HISTORY_KEY_GRANT_AAD_VERSION)
                    .put("context", GROUP_HISTORY_KEY_GRANT_CONTEXT)
                    .put("chatId", chatId.toString())
                    .put("historyKeyId", historyKeyId.toString())
                    .put("historyKey", historyKey)
                    .put("membershipVersion", membershipVersion)
                    .put("historyPolicy", historyPolicy == null ? "DIRECT" : historyPolicy.name())
                    .put("createdAt", createdAt.toString()));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize group history grant payload", exception);
        }
    }

    private String generateHistoryKeyMaterial() {
        byte[] keyBytes = new byte[GROUP_HISTORY_KEY_BYTES];
        secureRandom.nextBytes(keyBytes);
        return Base64.getEncoder().encodeToString(keyBytes);
    }

    public void broadcastOwnActiveHistoryKeyAccesses(UUID chatId, Set<UUID> recipientUserIds) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        ChatRoom room = chatRoomRepository.findById(chatId).orElse(null);
        if (room == null || room.getActiveHistoryKeyId() == null) {
            return;
        }

        Set<UUID> deletedUserIds = userDeletedChatRepository.findAllByChatId(chatId).stream()
                .map(deletedChat -> deletedChat.getUserId())
                .collect(Collectors.toSet());
        Map<UUID, UserAccount> participantsByUserId = chatService.findParticipants(chatId).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));

        chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId).stream()
                .filter(membership -> recipientUserIds.contains(membership.getUserId()))
                .filter(membership -> !deletedUserIds.contains(membership.getUserId()))
                .forEach(membership -> {
                    UserAccount recipient = participantsByUserId.get(membership.getUserId());
                    if (recipient == null) {
                        return;
                    }

                    resolveOwnHistoryKeyAccess(
                            chatId,
                            room,
                            membership,
                            membership.getUserId(),
                            room.getActiveHistoryKeyId()
                    ).ifPresent(access -> realtimeMessagingGateway.sendToUser(
                            recipient.getUsername(),
                            "/queue/group-history-active-keys",
                            new ActiveGroupHistoryKeyAccessEventResponse(
                                    chatId,
                                    access.historyKeyId(),
                                    access.wrappedKeyPayloadJson(),
                                    access.serverGrantPayloadJson(),
                                    access.createdAt(),
                                    access.updatedAt()
                            )
                    ));
                });
    }

    private Optional<GroupHistoryKeyAccessResponse> resolveOwnHistoryKeyAccess(
            UUID chatId,
            ChatRoom room,
            ChatParticipant membership,
            UUID currentUserId,
            UUID historyKeyId
    ) {
        return chatHistoryKeyUserAccessRepository.findByHistoryKeyIdAndRecipientUserId(historyKeyId, currentUserId)
                .map(this::toUserAccessResponse)
                .or(() -> resolveEscrowRecordsVisibleToMembership(chatId, room, membership).stream()
                        .filter(escrow -> escrow.getHistoryKeyId().equals(historyKeyId))
                        .findFirst()
                        .map(this::toEscrowAccessResponse));
    }

    private GroupHistoryKeyAccessResponse toUserAccessResponse(ChatHistoryKeyUserAccess access) {
        return new GroupHistoryKeyAccessResponse(
                access.getHistoryKeyId().toString(),
                access.getWrappedKeyPayloadJson(),
                null,
                access.getCreatedAt(),
                access.getUpdatedAt()
        );
    }

    private GroupHistoryKeyAccessResponse toEscrowAccessResponse(ChatHistoryKeyEscrow escrow) {
        return new GroupHistoryKeyAccessResponse(
                escrow.getHistoryKeyId().toString(),
                "",
                chatHistoryKeyEscrowCryptoService.decryptGrantPayload(
                        escrow.getEncryptedGrantPayloadJson()
                ),
                escrow.getCreatedAt(),
                escrow.getUpdatedAt()
        );
    }

    private void publishActiveHistoryKeyBroadcastRequest(UUID chatId, Set<UUID> recipientUserIds) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        eventPublisher.publishEvent(new ActiveGroupHistoryKeyBroadcastRequestedEvent(
                chatId,
                Set.copyOf(recipientUserIds)
        ));
    }

    private Map<UUID, ChatHistoryKeyUserAccess> findExistingAccessesByHistoryKeyId(
            UUID recipientUserId,
            Collection<UUID> historyKeyIds
    ) {
        if (recipientUserId == null || historyKeyIds == null || historyKeyIds.isEmpty()) {
            return Map.of();
        }

        return chatHistoryKeyUserAccessRepository.findAllByRecipientUserIdAndHistoryKeyIdIn(
                        recipientUserId,
                        historyKeyIds
                ).stream()
                .collect(Collectors.toMap(
                        ChatHistoryKeyUserAccess::getHistoryKeyId,
                        Function.identity()
                ));
    }

    private GroupHistoryKeyGrantPayload parseGroupHistoryGrantPayload(String serializedPayload) {
        try {
            JsonNode payload = objectMapper.readTree(serializedPayload);
            if (payload.path("aadVersion").asInt(-1) != GROUP_HISTORY_KEY_GRANT_AAD_VERSION) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Group history escrow payload must use current authenticated format"
                );
            }

            String context = payload.path("context").asText();
            String chatId = payload.path("chatId").asText();
            String historyKeyId = payload.path("historyKeyId").asText();
            String historyKey = payload.path("historyKey").asText();
            long membershipVersion = payload.path("membershipVersion").asLong(-1L);
            String historyPolicy = payload.path("historyPolicy").asText();
            String createdAt = payload.path("createdAt").asText();
            if (!GROUP_HISTORY_KEY_GRANT_CONTEXT.equals(context)
                    || chatId == null || chatId.isBlank()
                    || historyKeyId == null || historyKeyId.isBlank()
                    || historyKey == null || historyKey.isBlank()
                    || membershipVersion < 0
                    || historyPolicy == null || historyPolicy.isBlank()
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
                    membershipVersion,
                    normalizeHistoryPolicy(historyPolicy),
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

    private GroupHistorySyncCursor parseSyncCursor(String serializedCursor) {
        if (serializedCursor == null || serializedCursor.isBlank()) {
            return null;
        }

        int separatorIndex = serializedCursor.indexOf('|');
        if (separatorIndex <= 0 || separatorIndex >= serializedCursor.length() - 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group history sync cursor is malformed");
        }

        try {
            Instant updatedAt = Instant.parse(serializedCursor.substring(0, separatorIndex));
            UUID historyKeyId = UUID.fromString(serializedCursor.substring(separatorIndex + 1));
            return new GroupHistorySyncCursor(updatedAt, historyKeyId);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group history sync cursor is malformed");
        }
    }

    private boolean isAfterCursor(Instant updatedAt, UUID historyKeyId, GroupHistorySyncCursor cursor) {
        if (cursor == null) {
            return true;
        }

        int updatedAtComparison = updatedAt.compareTo(cursor.updatedAt());
        if (updatedAtComparison != 0) {
            return updatedAtComparison > 0;
        }

        return historyKeyId.toString().compareTo(cursor.historyKeyId().toString()) > 0;
    }

    private record GroupHistoryKeyGrantPayload(
            UUID chatId,
            UUID historyKeyId,
            String historyKey,
            long membershipVersion,
            String historyPolicy,
            Instant createdAt
    ) {
    }

    private record GroupHistorySyncCursor(
            Instant updatedAt,
            UUID historyKeyId
    ) {
    }

    private String normalizeHistoryPolicy(String historyPolicy) {
        if ("DIRECT".equals(historyPolicy)) {
            return historyPolicy;
        }
        try {
            return ChatPrejoinHistoryPolicy.valueOf(historyPolicy).name();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group history escrow payload is malformed"
            );
        }
    }
}
