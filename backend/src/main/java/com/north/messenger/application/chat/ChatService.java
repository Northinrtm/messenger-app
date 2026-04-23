package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ChatRemovalEventResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateGroupChatRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ChatRoomBan;
import com.north.messenger.domain.model.ChatRoomModerator;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.ChatRoomModeratorRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import io.micrometer.core.instrument.Timer;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatService {

    private static final String ENCRYPTED_MESSAGE_PLACEHOLDER = "Encrypted message";

    private final AuthService authService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomBanRepository chatRoomBanRepository;
    private final ChatRoomModeratorRepository chatRoomModeratorRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserArchivedChatRepository userArchivedChatRepository;
    private final UserDeletedChatRepository userDeletedChatRepository;
    private final UserDeletedMessageRepository userDeletedMessageRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final MessengerTelemetry telemetry;
    private final DirectChatCreationLockService directChatCreationLockService;

    public ChatService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatRoomBanRepository chatRoomBanRepository,
            ChatRoomModeratorRepository chatRoomModeratorRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            UserArchivedChatRepository userArchivedChatRepository,
            UserDeletedChatRepository userDeletedChatRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            MessengerTelemetry telemetry,
            DirectChatCreationLockService directChatCreationLockService
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatRoomBanRepository = chatRoomBanRepository;
        this.chatRoomModeratorRepository = chatRoomModeratorRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.userArchivedChatRepository = userArchivedChatRepository;
        this.userDeletedChatRepository = userDeletedChatRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.telemetry = telemetry;
        this.directChatCreationLockService = directChatCreationLockService;
    }

    public List<ChatSummaryResponse> listChats(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(currentUser.getId());
        if (memberships.isEmpty()) {
            return List.of();
        }

        List<UUID> chatIds = memberships.stream()
                .map(ChatParticipant::getChatId)
                .toList();
        Set<UUID> deletedChatIds = userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(currentUser.getId()).stream()
                .map(UserDeletedChat::getChatId)
                .collect(Collectors.toSet());
        List<UUID> visibleChatIds = chatIds.stream()
                .filter(chatId -> !deletedChatIds.contains(chatId))
                .toList();
        if (visibleChatIds.isEmpty()) {
            return List.of();
        }

        Map<UUID, ChatRoom> roomsById = chatRoomRepository.findAllById(visibleChatIds).stream()
                .collect(Collectors.toMap(ChatRoom::getId, Function.identity()));
        Map<UUID, Integer> unreadCountsByChatId = loadUnreadCounts(visibleChatIds, currentUser.getId());

        List<ChatSummaryResponse> chats = new ArrayList<>();
        for (UUID chatId : visibleChatIds) {
            ChatRoom room = roomsById.get(chatId);
            if (room != null) {
                chats.add(toSummary(room, currentUser.getId(), unreadCountsByChatId.getOrDefault(chatId, 0)));
            }
        }

        chats.sort(ChatService::compareChatSummaryActivity);
        return chats;
    }

    public List<UUID> listArchivedChatIds(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        Set<UUID> deletedChatIds = userDeletedChatRepository.findAllByUserIdOrderByDeletedAtDesc(currentUser.getId()).stream()
                .map(UserDeletedChat::getChatId)
                .collect(Collectors.toSet());
        return userArchivedChatRepository.findAllByUserIdOrderByArchivedAtDesc(currentUser.getId()).stream()
                .map(UserArchivedChat::getChatId)
                .filter(chatId -> !deletedChatIds.contains(chatId))
                .toList();
    }

    @Transactional
    public void updateArchivedChatState(String username, UUID chatId, boolean archived) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireChatMembership(chatId, currentUser);

        if (archived) {
            userArchivedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                    .orElseGet(() -> userArchivedChatRepository.save(
                            new UserArchivedChat(UUID.randomUUID(), currentUser.getId(), chatId, Instant.now())
                    ));
            return;
        }

        userArchivedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                .ifPresent(userArchivedChatRepository::delete);
    }

    @Transactional
    public void deleteChatForSelf(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireChatMembership(chatId, currentUser);

        userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                .orElseGet(() -> userDeletedChatRepository.save(
                        new UserDeletedChat(UUID.randomUUID(), currentUser.getId(), chatId, Instant.now())
                ));
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        realtimeMessagingGateway.sendToUser(
                currentUser.getUsername(),
                "/queue/chat-removals",
                new ChatRemovalEventResponse(chatId)
        );
    }

    @Transactional
    public ChatSummaryResponse createDirectChat(String username, CreateDirectChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        UserAccount participant = authService.requireExistingUser(request.participantUsername());

        if (currentUser.getId().equals(participant.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot create a direct chat with yourself");
        }

        authService.assertUsersCanCommunicate(currentUser, participant);

        DirectChatPair directChatPair = DirectChatPair.of(currentUser.getId(), participant.getId());
        directChatCreationLockService.lockForPair(directChatPair.lowUserId(), directChatPair.highUserId());

        return findDirectChat(directChatPair, currentUser, participant)
                .map(room -> {
                    restoreDeletedChatStateForUsers(room.getId(), List.of(currentUser.getId()));
                    notifyChatUpdated(room.getId());
                    return toSummary(room, currentUser.getId());
                })
                .orElseGet(() -> createNewDirectChat(currentUser, participant, directChatPair));
    }

    @Transactional
    public ChatSummaryResponse createGroupChat(String username, CreateGroupChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                request.participantUsernames(),
                currentUser.getUsername(),
                List.of()
        );

        List<UserAccount> participants = normalizedUsernames.stream()
                .map(authService::requireExistingUser)
                .toList();

        ChatRoom room = new ChatRoom(
                UUID.randomUUID(),
                request.title().trim(),
                false,
                Instant.now()
        );
        room.updateOwnerUserId(currentUser.getId());
        chatRoomRepository.save(room);
        addParticipants(room.getId(), currentUser, participants);
        notifyChatUpdated(room.getId());
        return getChatSummaryForUser(room.getId(), currentUser);
    }

    @Transactional
    public ChatSummaryResponse addGroupParticipants(
            String username,
            UUID chatId,
            AddGroupParticipantsRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot add participants to a direct chat");
        }
        requireGroupOwner(room, currentUser);

        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        List<String> existingUsernames = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        ).values().stream()
                .map(UserAccount::getUsername)
                .toList();

        LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                request.participantUsernames(),
                currentUser.getUsername(),
                existingUsernames
        );

        if (normalizedUsernames.isEmpty()) {
            return getChatSummaryForUser(chatId, currentUser);
        }

        List<UserAccount> participants = normalizedUsernames.stream()
                .map(authService::requireExistingUser)
                .toList();
        participants.forEach(participant -> requireGroupNotBanned(chatId, participant));

        Instant joinedAt = Instant.now();
        participants.forEach(participant ->
                chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, participant.getId(), joinedAt))
        );
        notifyChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    @Transactional
    public ChatSummaryResponse updateGroupChat(String username, UUID chatId, UpdateGroupChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be updated");
        }
        requireGroupOwner(room, currentUser);

        room.updateGroupDetails(normalizeGroupTitle(request.title()), normalizeAvatarUrl(request.avatarUrl()));
        chatRoomRepository.save(room);
        notifyChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    @Transactional
    public void leaveGroup(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be left");
        }
        if (Objects.equals(room.getOwnerUserId(), currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group owner cannot leave the group");
        }

        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        if (memberships.size() == 1) {
            deleteGroup(username, chatId);
            return;
        }

        chatParticipantRepository.deleteByChatIdAndUserId(chatId, currentUser.getId());
        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, currentUser.getId());
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        userDeletedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);

        if (Objects.equals(room.getOwnerUserId(), currentUser.getId())) {
            UUID nextOwnerUserId = memberships.stream()
                    .map(ChatParticipant::getUserId)
                    .filter(userId -> !userId.equals(currentUser.getId()))
                    .findFirst()
                    .orElse(null);
            room.updateOwnerUserId(nextOwnerUserId);
            chatRoomRepository.save(room);
            if (nextOwnerUserId != null) {
                chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, nextOwnerUserId);
            }
        }

        realtimeMessagingGateway.sendToUser(
                currentUser.getUsername(),
                "/queue/chat-removals",
                new ChatRemovalEventResponse(chatId)
        );
        notifyChatUpdated(chatId);
    }

    @Transactional
    public void deleteGroup(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be deleted as a group");
        }
        requireGroupOwner(room, currentUser);

        List<UserAccount> participants = findParticipants(chatId);
        participants.forEach(participant -> realtimeMessagingGateway.sendToUser(
                participant.getUsername(),
                "/queue/chat-removals",
                new ChatRemovalEventResponse(chatId)
        ));
        chatRoomRepository.delete(room);
    }

    @Transactional
    public void banGroupParticipant(String username, UUID chatId, String bannedUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support bans");
        }
        GroupRole currentRole = requireGroupModeratorOrOwner(room, currentUser);

        UserAccount bannedUser = authService.requireExistingUser(bannedUsername);
        assertCanModerateTarget(room, currentUser, currentRole, bannedUser, "ban");

        chatRoomBanRepository.findByChatIdAndUserId(chatId, bannedUser.getId())
                .orElseGet(() -> chatRoomBanRepository.save(
                        new ChatRoomBan(UUID.randomUUID(), chatId, bannedUser.getId(), currentUser.getId(), Instant.now())
                ));

        boolean wasMember = chatParticipantRepository.existsByChatIdAndUserId(chatId, bannedUser.getId());
        if (wasMember) {
            chatParticipantRepository.deleteByChatIdAndUserId(chatId, bannedUser.getId());
            chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, bannedUser.getId());
            userArchivedChatRepository.deleteByUserIdAndChatId(bannedUser.getId(), chatId);
            userDeletedChatRepository.deleteByUserIdAndChatId(bannedUser.getId(), chatId);
            realtimeMessagingGateway.sendToUser(
                    bannedUser.getUsername(),
                    "/queue/chat-removals",
                    new ChatRemovalEventResponse(chatId)
            );
            notifyChatUpdated(chatId);
        }
    }

    @Transactional
    public void assignGroupModerator(String username, UUID chatId, String moderatorUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support moderators");
        }
        requireGroupOwner(room, currentUser);

        UserAccount moderatorUser = authService.requireExistingUser(moderatorUsername);
        if (moderatorUser.getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Owner already has full access");
        }
        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, moderatorUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not a member of this group");
        }

        UUID ownerUserId = resolveGroupOwnerUserId(room, chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId));
        if (Objects.equals(ownerUserId, moderatorUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group owner cannot be assigned as moderator");
        }

        chatRoomModeratorRepository.findByChatIdAndUserId(chatId, moderatorUser.getId())
                .orElseGet(() -> chatRoomModeratorRepository.save(
                        new ChatRoomModerator(UUID.randomUUID(), chatId, moderatorUser.getId(), currentUser.getId(), Instant.now())
                ));
        notifyChatUpdated(chatId);
    }

    @Transactional
    public void revokeGroupModerator(String username, UUID chatId, String moderatorUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support moderators");
        }
        requireGroupOwner(room, currentUser);

        UserAccount moderatorUser = authService.requireExistingUser(moderatorUsername);
        UUID ownerUserId = resolveGroupOwnerUserId(room, chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId));
        if (Objects.equals(ownerUserId, moderatorUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group owner cannot lose owner access");
        }

        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, moderatorUser.getId());
        notifyChatUpdated(chatId);
    }

    @Transactional
    public void removeGroupParticipant(String username, UUID chatId, String participantUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support participant removal");
        }
        GroupRole currentRole = requireGroupModeratorOrOwner(room, currentUser);

        UserAccount participant = authService.requireExistingUser(participantUsername);
        assertCanModerateTarget(room, currentUser, currentRole, participant, "remove");

        chatParticipantRepository.deleteByChatIdAndUserId(chatId, participant.getId());
        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, participant.getId());
        userArchivedChatRepository.deleteByUserIdAndChatId(participant.getId(), chatId);
        userDeletedChatRepository.deleteByUserIdAndChatId(participant.getId(), chatId);
        realtimeMessagingGateway.sendToUser(
                participant.getUsername(),
                "/queue/chat-removals",
                new ChatRemovalEventResponse(chatId)
        );
        notifyChatUpdated(chatId);
    }

    @Transactional
    public ChatSummaryResponse joinGroupViaInvite(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatRoomRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found"));
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat links are not supported");
        }
        requireGroupNotBanned(chatId, currentUser);

        boolean alreadyMember = chatParticipantRepository.existsByChatIdAndUserId(chatId, currentUser.getId());
        if (!alreadyMember) {
            chatParticipantRepository.save(
                    new ChatParticipant(UUID.randomUUID(), chatId, currentUser.getId(), Instant.now())
            );
        }

        restoreDeletedChatStateForUsers(chatId, List.of(currentUser.getId()));
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        if (!alreadyMember) {
            notifyChatUpdated(chatId);
        }
        return getChatSummaryForUser(chatId, currentUser);
    }

    public ChatRoom requireChatMembership(UUID chatId, String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        return requireChatMembership(chatId, currentUser);
    }

    public ChatRoom requireChatMembership(UUID chatId, UserAccount user) {
        ChatRoom room = chatRoomRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found"));

        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat");
        }
        return room;
    }

    public ChatRoom requireGroupInviteLinkAccess(UUID chatId, String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat links are not supported");
        }
        requireGroupModeratorOrOwner(room, currentUser);
        return room;
    }

    public void assertChatInteractionAllowed(ChatRoom room, UserAccount currentUser) {
        if (!room.isDirect()) {
            return;
        }

        resolveOtherDirectParticipant(room.getId(), currentUser.getId())
                .ifPresent(otherParticipant -> authService.assertUsersCanCommunicate(currentUser, otherParticipant));
    }

    public ChatRoom getChatRoom(UUID chatId) {
        return chatRoomRepository.findById(chatId)
                .orElse(null);
    }

    public ChatSummaryResponse getChatSummaryForUser(UUID chatId, UserAccount user) {
        ChatRoom room = requireChatMembership(chatId, user);
        return toSummary(room, user.getId());
    }

    public List<UserAccount> findParticipants(UUID chatId) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );

        return memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .toList();
    }

    public void notifyChatUpdated(UUID chatId) {
        Timer.Sample telemetrySample = telemetry.startSample();
        ChatRoom room = chatRoomRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found"));
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        List<UUID> participantUserIds = memberships.stream()
                .map(ChatParticipant::getUserId)
                .toList();
        Map<UUID, UserAccount> usersById = findUsersById(
                participantUserIds
        );
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(participantUserIds);
        List<ParticipantResponse> members = buildParticipantResponses(memberships, usersById, onlineByUserId);
        List<UUID> moderatorUserIds = resolveModeratorUserIds(chatId);
        Map<UUID, Integer> unreadCountsByUserId = loadUnreadCountsForUsers(chatId);
        List<UserDeletedChat> deletedChatEntries = userDeletedChatRepository.findAllByChatId(chatId);
        Set<UUID> deletedUserIds = (deletedChatEntries == null ? List.<UserDeletedChat>of() : deletedChatEntries).stream()
                .map(UserDeletedChat::getUserId)
                .collect(Collectors.toSet());

        List<UserAccount> audience = memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .filter(user -> !deletedUserIds.contains(user.getId()))
                .toList();
        Map<UUID, ChatMessage> lastMessagesByUserId = resolveLastVisibleMessagesForAudience(chatId, audience);

        try {
            audience.forEach(user -> realtimeMessagingGateway.sendToUser(
                            user.getUsername(),
                            "/queue/chats",
                            toSummary(
                                    room,
                                    user.getId(),
                                    usersById,
                                    unreadCountsByUserId.getOrDefault(user.getId(), 0),
                                    memberships,
                                    moderatorUserIds,
                                    members,
                                    lastMessagesByUserId.get(user.getId())
                            )
                    ));
            telemetry.recordChatSummaryBroadcast(telemetrySample, room, audience.size(), "sent", chatId);
        } catch (RuntimeException exception) {
            telemetry.recordChatSummaryBroadcast(telemetrySample, room, audience.size(), "error", chatId);
            throw exception;
        }
    }

    @Transactional
    public ChatSummaryResponse updatePinnedMessage(String username, UUID chatId, UUID messageId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);

        if (messageId == null) {
            room.clearPinnedMessage();
        } else {
            ChatMessage message = chatMessageRepository.findById(messageId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
            if (!message.getChatId().equals(chatId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message must belong to the same chat");
            }

            room.pinMessage(message.getId(), Instant.now());
        }

        notifyChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    private Optional<ChatRoom> findDirectChat(
            DirectChatPair directChatPair,
            UserAccount currentUser,
            UserAccount participant
    ) {
        return chatRoomRepository.findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(
                        directChatPair.lowUserId(),
                        directChatPair.highUserId()
                )
                .or(() -> chatRoomRepository.findDirectChatByParticipantIds(currentUser.getId(), participant.getId()));
    }

    private ChatSummaryResponse createNewDirectChat(
            UserAccount currentUser,
            UserAccount participant,
            DirectChatPair directChatPair
    ) {
        ChatRoom room = new ChatRoom(
                UUID.randomUUID(),
                null,
                true,
                Instant.now(),
                directChatPair.lowUserId(),
                directChatPair.highUserId()
        );
        chatRoomRepository.save(room);
        addParticipants(room.getId(), currentUser, List.of(participant));
        notifyChatUpdated(room.getId());
        return getChatSummaryForUser(room.getId(), currentUser);
    }

    private record DirectChatPair(
            UUID lowUserId,
        UUID highUserId
    ) {
        static DirectChatPair of(UUID firstUserId, UUID secondUserId) {
            if (firstUserId.toString().compareTo(secondUserId.toString()) < 0) {
                return new DirectChatPair(firstUserId, secondUserId);
            }
            return new DirectChatPair(secondUserId, firstUserId);
        }
    }

    private ChatSummaryResponse toSummary(ChatRoom room, UUID currentUserId) {
        return toSummary(room, currentUserId, loadUnreadCount(room.getId(), currentUserId));
    }

    @Transactional
    public void restoreDeletedChatStateForUsers(UUID chatId, Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }

        userDeletedChatRepository.deleteByChatIdAndUserIdIn(chatId, userIds);
    }

    private ChatSummaryResponse toSummary(ChatRoom room, UUID currentUserId, int unreadCount) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId());
        List<UUID> participantUserIds = memberships.stream()
                .map(ChatParticipant::getUserId)
                .toList();
        Map<UUID, UserAccount> usersById = findUsersById(
                participantUserIds
        );
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(participantUserIds);
        return toSummary(
                room,
                currentUserId,
                usersById,
                unreadCount,
                memberships,
                resolveModeratorUserIds(room.getId()),
                buildParticipantResponses(memberships, usersById, onlineByUserId)
        );
    }

    private ChatSummaryResponse toSummary(
            ChatRoom room,
            UUID currentUserId,
            Map<UUID, UserAccount> usersById,
            int unreadCount,
            List<ChatParticipant> memberships,
            List<UUID> moderatorUserIds,
            List<ParticipantResponse> members
    ) {
        return toSummary(
                room,
                currentUserId,
                usersById,
                unreadCount,
                memberships,
                moderatorUserIds,
                members,
                findLatestVisibleMessage(room.getId(), currentUserId)
        );
    }

    private ChatSummaryResponse toSummary(
            ChatRoom room,
            UUID currentUserId,
            Map<UUID, UserAccount> usersById,
            int unreadCount,
            List<ChatParticipant> memberships,
            List<UUID> moderatorUserIds,
            List<ParticipantResponse> members,
            ChatMessage lastMessage
    ) {
        UUID ownerUserId = resolveGroupOwnerUserId(room, memberships);
        MessageSnippetResponse pinnedMessage = buildPinnedSnippet(room, currentUserId, usersById);
        Instant updatedAt = lastMessage != null ? lastMessage.getCreatedAt() : room.getCreatedAt();

        String title;
        if (room.isDirect()) {
            title = members.stream()
                    .filter(member -> !member.id().equals(currentUserId))
                    .map(ParticipantResponse::displayName)
                    .findFirst()
                    .orElse("Direct chat");
        } else {
            title = room.getTitle() != null && !room.getTitle().isBlank() ? room.getTitle() : "Untitled room";
        }

        return new ChatSummaryResponse(
                room.getId(),
                room.isDirect(),
                title,
                room.isDirect() ? null : room.getAvatarUrl(),
                room.isDirect() ? null : ownerUserId,
                room.isDirect() ? List.of() : moderatorUserIds,
                members,
                lastMessage != null ? summarizeLastMessage(lastMessage) : null,
                lastMessage != null ? lastMessage.getCreatedAt() : null,
                lastMessage != null ? lastMessage.getServerOrder() : null,
                updatedAt,
                unreadCount,
                pinnedMessage
        );
    }

    private static int compareChatSummaryActivity(ChatSummaryResponse left, ChatSummaryResponse right) {
        int updatedAtComparison = right.updatedAt().compareTo(left.updatedAt());
        if (updatedAtComparison != 0) {
            return updatedAtComparison;
        }

        long leftOrder = left.lastMessageServerOrder() != null ? left.lastMessageServerOrder() : Long.MIN_VALUE;
        long rightOrder = right.lastMessageServerOrder() != null ? right.lastMessageServerOrder() : Long.MIN_VALUE;
        int serverOrderComparison = Long.compare(rightOrder, leftOrder);
        if (serverOrderComparison != 0) {
            return serverOrderComparison;
        }

        return right.id().compareTo(left.id());
    }

    private List<ParticipantResponse> buildParticipantResponses(
            List<ChatParticipant> memberships,
            Map<UUID, UserAccount> usersById,
            Map<UUID, Boolean> onlineByUserId
    ) {
        return memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .map(user -> authService.toParticipant(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();
    }

    private int loadUnreadCount(UUID chatId, UUID userId) {
        return loadUnreadCounts(List.of(chatId), userId).getOrDefault(chatId, 0);
    }

    private ChatMessage findLatestVisibleMessage(UUID chatId, UUID userId) {
        return chatMessageRepository.findLatestVisibleByChatIdAndUserId(
                        chatId,
                        userId,
                        PageRequest.of(0, 1)
                ).stream()
                .findFirst()
                .orElse(null);
    }

    private ChatMessage findLatestEncryptedMessage(UUID chatId) {
        return chatMessageRepository.findLatestEncryptedByChatId(
                        chatId,
                        PageRequest.of(0, 1)
                ).stream()
                .findFirst()
                .orElse(null);
    }

    private Map<UUID, ChatMessage> resolveLastVisibleMessagesForAudience(UUID chatId, List<UserAccount> audience) {
        Map<UUID, ChatMessage> lastMessagesByUserId = new LinkedHashMap<>();
        if (audience.isEmpty()) {
            return lastMessagesByUserId;
        }

        ChatMessage latestMessage = findLatestEncryptedMessage(chatId);
        if (latestMessage == null) {
            audience.forEach(user -> lastMessagesByUserId.put(user.getId(), null));
            return lastMessagesByUserId;
        }

        Set<UUID> deletedLatestMessageUserIds = userDeletedMessageRepository.findAllByMessageIdAndUserIdIn(
                        latestMessage.getId(),
                        audience.stream().map(UserAccount::getId).toList()
                ).stream()
                .map(UserDeletedMessage::getUserId)
                .collect(Collectors.toSet());

        audience.forEach(user -> lastMessagesByUserId.put(
                user.getId(),
                deletedLatestMessageUserIds.contains(user.getId())
                        ? findLatestVisibleMessage(chatId, user.getId())
                        : latestMessage
        ));
        return lastMessagesByUserId;
    }

    private MessageSnippetResponse buildPinnedSnippet(
            ChatRoom room,
            UUID currentUserId,
            Map<UUID, UserAccount> usersById
    ) {
        UUID pinnedMessageId = room.getPinnedMessageId();
        if (pinnedMessageId == null) {
            return null;
        }

        if (userDeletedMessageRepository.existsByUserIdAndMessageId(currentUserId, pinnedMessageId)) {
            return null;
        }

        ChatMessage pinnedMessage = chatMessageRepository.findById(pinnedMessageId).orElse(null);
        if (pinnedMessage == null || !pinnedMessage.getChatId().equals(room.getId())) {
            return null;
        }

        UserAccount sender = usersById.get(pinnedMessage.getSenderId());
        if (sender == null) {
            sender = userAccountRepository.findById(pinnedMessage.getSenderId()).orElse(null);
        }
        if (sender == null) {
            return null;
        }

        return new MessageSnippetResponse(
                pinnedMessage.getId(),
                authService.toParticipant(sender),
                pinnedMessage.getCreatedAt(),
                summarizeLastMessage(pinnedMessage)
        );
    }

    private String summarizeLastMessage(ChatMessage lastMessage) {
        return ENCRYPTED_MESSAGE_PLACEHOLDER;
    }

    private Map<UUID, Integer> loadUnreadCounts(Collection<UUID> chatIds, UUID userId) {
        if (chatIds.isEmpty()) {
            return Map.of();
        }

        return messageReceiptRepository.countUnreadByUserIdAndChatIdIn(userId, chatIds).stream()
                .collect(Collectors.toMap(
                        MessageReceiptRepository.ChatUnreadCountView::getChatId,
                        view -> Math.toIntExact(view.getUnreadCount())
                ));
    }

    private Map<UUID, Integer> loadUnreadCountsForUsers(UUID chatId) {
        return messageReceiptRepository.countUnreadByChatId(chatId).stream()
                .collect(Collectors.toMap(
                        MessageReceiptRepository.UserUnreadCountView::getUserId,
                        view -> Math.toIntExact(view.getUnreadCount())
                ));
    }

    private void addParticipants(UUID chatId, UserAccount currentUser, List<UserAccount> participants) {
        Instant joinedAt = Instant.now();
        chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, currentUser.getId(), joinedAt));
        for (int index = 0; index < participants.size(); index++) {
            chatParticipantRepository.save(new ChatParticipant(
                    UUID.randomUUID(),
                    chatId,
                    participants.get(index).getId(),
                    joinedAt.plusMillis(index + 1L)
            ));
        }
    }

    private Optional<UserAccount> resolveOtherDirectParticipant(UUID chatId, UUID currentUserId) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        List<UUID> otherUserIds = memberships.stream()
                .map(ChatParticipant::getUserId)
                .filter(userId -> !userId.equals(currentUserId))
                .toList();
        if (otherUserIds.isEmpty()) {
            return Optional.empty();
        }

        return userAccountRepository.findById(otherUserIds.get(0));
    }

    private void requireGroupOwner(ChatRoom room, UserAccount currentUser) {
        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
        );
        if (!Objects.equals(ownerUserId, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the group owner can manage this group");
        }
    }

    private GroupRole requireGroupModeratorOrOwner(ChatRoom room, UserAccount currentUser) {
        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
        );
        if (Objects.equals(ownerUserId, currentUser.getId())) {
            return GroupRole.OWNER;
        }
        if (chatRoomModeratorRepository.existsByChatIdAndUserId(room.getId(), currentUser.getId())) {
            return GroupRole.MODERATOR;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the group owner or moderators can manage members");
    }

    private void requireGroupNotBanned(UUID chatId, UserAccount user) {
        if (chatRoomBanRepository.existsByChatIdAndUserId(chatId, user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "User is banned from this group");
        }
    }

    private UUID resolveGroupOwnerUserId(ChatRoom room, List<ChatParticipant> memberships) {
        if (room.isDirect()) {
            return null;
        }

        UUID currentOwnerUserId = room.getOwnerUserId();
        if (currentOwnerUserId != null && memberships.stream()
                .map(ChatParticipant::getUserId)
                .anyMatch(currentOwnerUserId::equals)) {
            return currentOwnerUserId;
        }

        UUID fallbackOwnerUserId = memberships.stream()
                .map(ChatParticipant::getUserId)
                .findFirst()
                .orElse(null);
        if (!Objects.equals(currentOwnerUserId, fallbackOwnerUserId)) {
            room.updateOwnerUserId(fallbackOwnerUserId);
            chatRoomRepository.save(room);
        }
        return fallbackOwnerUserId;
    }

    private List<UUID> resolveModeratorUserIds(UUID chatId) {
        return chatRoomModeratorRepository.findAllByChatId(chatId).stream()
                .map(ChatRoomModerator::getUserId)
                .toList();
    }

    private void assertCanModerateTarget(
            ChatRoom room,
            UserAccount currentUser,
            GroupRole currentRole,
            UserAccount targetUser,
            String action
    ) {
        if (targetUser.getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use leave instead of moderating yourself");
        }
        if (!chatParticipantRepository.existsByChatIdAndUserId(room.getId(), targetUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not a member of this group");
        }

        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
        );
        if (Objects.equals(ownerUserId, targetUser.getId())) {
            String actionPastTense = "ban".equals(action) ? "banned" : "removed";
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Group owner cannot be " + actionPastTense);
        }
        boolean targetIsModerator = chatRoomModeratorRepository.existsByChatIdAndUserId(room.getId(), targetUser.getId());
        if (currentRole == GroupRole.MODERATOR && targetIsModerator) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Moderators cannot manage other moderators");
        }
    }

    private enum GroupRole {
        OWNER,
        MODERATOR
    }

    private LinkedHashSet<String> normalizeParticipantUsernames(
            List<String> participantUsernames,
            String currentUsername,
            List<String> usernamesToSkip
    ) {
        LinkedHashSet<String> excludedUsernames = usernamesToSkip.stream()
                .map(this::normalizeUsername)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        return participantUsernames.stream()
                .map(this::normalizeUsername)
                .filter(candidate -> !candidate.equals(currentUsername))
                .filter(candidate -> !excludedUsernames.contains(candidate))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Map<UUID, UserAccount> findUsersById(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }

        return userAccountRepository.findAllByIdIn(ids).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeGroupTitle(String title) {
        return title.trim();
    }

    private String normalizeAvatarUrl(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return null;
        }
        if (!avatarUrl.startsWith("data:image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar must be an image");
        }

        return avatarUrl;
    }
}
