package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatCapabilitiesResponse;
import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ChatRemovalEventResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.MessageSnippetResponse;
import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateGroupChatRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.MessagePreviewService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatPinnedMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ChatRoomBan;
import com.north.messenger.domain.model.ChatRoomModerator;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.model.UserDeletedMessage;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.ChatPinnedMessageRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.ChatRoomModeratorRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserChatReactionAttentionRepository;
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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatService {

    private final AuthService authService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomBanRepository chatRoomBanRepository;
    private final ChatRoomModeratorRepository chatRoomModeratorRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatPinnedMessageRepository chatPinnedMessageRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserArchivedChatRepository userArchivedChatRepository;
    private final UserDeletedChatRepository userDeletedChatRepository;
    private final UserDeletedMessageRepository userDeletedMessageRepository;
    private final UserChatReactionAttentionRepository userChatReactionAttentionRepository;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final MessengerTelemetry telemetry;
    private final DirectChatCreationLockService directChatCreationLockService;
    private final ApplicationEventPublisher eventPublisher;
    private final MessagePreviewService messagePreviewService;

    public ChatService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatRoomBanRepository chatRoomBanRepository,
            ChatRoomModeratorRepository chatRoomModeratorRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatPinnedMessageRepository chatPinnedMessageRepository,
            ChatMessageRepository chatMessageRepository,
            MessageReactionRepository messageReactionRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            UserArchivedChatRepository userArchivedChatRepository,
            UserDeletedChatRepository userDeletedChatRepository,
            UserDeletedMessageRepository userDeletedMessageRepository,
            UserChatReactionAttentionRepository userChatReactionAttentionRepository,
            RealtimeMessagingGateway realtimeMessagingGateway,
            MessengerTelemetry telemetry,
            DirectChatCreationLockService directChatCreationLockService,
            ApplicationEventPublisher eventPublisher,
            MessagePreviewService messagePreviewService
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatRoomBanRepository = chatRoomBanRepository;
        this.chatRoomModeratorRepository = chatRoomModeratorRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatPinnedMessageRepository = chatPinnedMessageRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.userArchivedChatRepository = userArchivedChatRepository;
        this.userDeletedChatRepository = userDeletedChatRepository;
        this.userDeletedMessageRepository = userDeletedMessageRepository;
        this.userChatReactionAttentionRepository = userChatReactionAttentionRepository;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.telemetry = telemetry;
        this.directChatCreationLockService = directChatCreationLockService;
        this.eventPublisher = eventPublisher;
        this.messagePreviewService = messagePreviewService;
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
                chats.add(toSummary(
                        room,
                        currentUser.getId(),
                        unreadCountsByChatId.getOrDefault(chatId, 0)
                ));
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
        scheduleChatRemoval(chatId, List.of(currentUser.getUsername()));
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
                    reopenDeletedChatForUser(room, currentUser);
                    scheduleChatUpdated(room.getId());
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
        addParticipants(room, currentUser, participants);
        persistMembershipVersionIncrement(room);
        scheduleChatUpdated(room.getId());
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
                resolveActiveMemberships(chatId, memberships).stream().map(ChatParticipant::getUserId).toList()
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

        participants.forEach(participant -> {
            ChatParticipant existingMembership = chatParticipantRepository.findByChatIdAndUserId(chatId, participant.getId())
                    .orElse(null);
            if (existingMembership == null) {
                Instant joinedAt = Instant.now();
                ChatParticipant membership = new ChatParticipant(UUID.randomUUID(), chatId, participant.getId(), joinedAt);
                grantPrejoinHistoryAccessIfEnabled(room, membership, joinedAt);
                chatParticipantRepository.save(membership);
                return;
            }
            if (!isActiveMembership(chatId, existingMembership)) {
                existingMembership.restoreMembership();
            }
        });
        persistMembershipVersionIncrement(room);
        scheduleChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    @Transactional
    public ChatSummaryResponse updateGroupChat(String username, UUID chatId, UpdateGroupChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be updated");
        }
        boolean ownerAccess = hasGroupOwnerAccess(room, currentUser);
        if (!ownerAccess) {
            requireGroupModeratorOrOwnerAccess(room, currentUser);
        }

        ChatPrejoinHistoryPolicy previousPrejoinHistoryPolicy = room.getPrejoinHistoryPolicy();
        if (!ownerAccess
                && request.prejoinHistoryPolicy() != null
                && resolvePrejoinHistoryPolicy(request.prejoinHistoryPolicy(), previousPrejoinHistoryPolicy)
                        != previousPrejoinHistoryPolicy) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only the group owner can change history visibility for new members"
            );
        }
        ChatPrejoinHistoryPolicy nextPrejoinHistoryPolicy = resolvePrejoinHistoryPolicy(
                request.prejoinHistoryPolicy(),
                previousPrejoinHistoryPolicy
        );
        room.updateGroupDetails(
                normalizeGroupTitle(request.title()),
                normalizeAvatarUrl(request.avatarUrl()),
                nextPrejoinHistoryPolicy
        );
        chatRoomRepository.save(room);
        if (previousPrejoinHistoryPolicy != nextPrejoinHistoryPolicy
                && nextPrejoinHistoryPolicy == ChatPrejoinHistoryPolicy.FULL_HISTORY) {
            Instant grantedAt = Instant.now();
            List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
            memberships.forEach(membership -> {
                if (membership.getPrejoinHistoryAccessGrantedAt() == null) {
                    membership.grantPrejoinHistoryAccess(grantedAt);
                }
            });
        }
        scheduleChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    @Transactional
    public void leaveGroup(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be left");
        }
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        List<ChatParticipant> activeMemberships = resolveActiveMemberships(chatId, memberships);
        UUID ownerUserId = resolveGroupOwnerUserId(room, activeMemberships);
        if (Objects.equals(ownerUserId, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group owner cannot leave the group");
        }
        if (activeMemberships.size() == 1) {
            deleteGroup(username, chatId);
            return;
        }

        ChatParticipant membership = memberships.stream()
                .filter(candidate -> candidate.getUserId().equals(currentUser.getId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
        membership.leave(Instant.now());
        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, currentUser.getId());
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        userDeletedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        persistMembershipVersionIncrement(room);
        scheduleChatUpdated(chatId);
    }

    @Transactional
    public void deleteGroup(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat cannot be deleted as a group");
        }
        requireGroupOwner(room, currentUser);

        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );
        List<String> usernames = memberships.stream()
                .map(ChatParticipant::getUserId)
                .map(usersById::get)
                .filter(Objects::nonNull)
                .map(UserAccount::getUsername)
                .toList();
        scheduleChatRemoval(chatId, usernames);
        chatRoomRepository.delete(room);
    }

    @Transactional
    public void banGroupParticipant(String username, UUID chatId, String bannedUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support bans");
        }
        GroupRole currentRole = resolveGroupModeratorRoleOrThrow(room, currentUser);

        UserAccount bannedUser = authService.requireExistingUser(bannedUsername);
        assertCanModerateTarget(room, currentUser, currentRole, bannedUser, "ban");

        chatRoomBanRepository.findByChatIdAndUserId(chatId, bannedUser.getId())
                .orElseGet(() -> chatRoomBanRepository.save(
                        new ChatRoomBan(UUID.randomUUID(), chatId, bannedUser.getId(), currentUser.getId(), Instant.now())
                ));

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, bannedUser.getId())
                .orElse(null);
        if (membership != null && membership.isActive()) {
            membership.leave(Instant.now());
            chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, bannedUser.getId());
            persistMembershipVersionIncrement(room);
        }
        scheduleChatUpdated(chatId);
    }

    @Transactional
    public void unbanGroupParticipant(String username, UUID chatId, String unbannedUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support bans");
        }
        requireGroupModeratorOrOwnerAccess(room, currentUser);

        UserAccount unbannedUser = authService.requireExistingUser(unbannedUsername);
        ChatRoomBan ban = chatRoomBanRepository.findByChatIdAndUserId(chatId, unbannedUser.getId()).orElse(null);
        chatRoomBanRepository.deleteByChatIdAndUserId(chatId, unbannedUser.getId());
        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, unbannedUser.getId())
                .orElse(null);
        if (ban != null && membership != null && membership.getLeftAt() != null) {
            membership.restoreMembership();
            persistMembershipVersionIncrement(room);
        }
        scheduleChatUpdated(chatId);
    }

    @Transactional(readOnly = true)
    public List<ParticipantResponse> listGroupBans(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support bans");
        }
        requireGroupModeratorOrOwnerAccess(room, currentUser);

        List<ChatRoomBan> bans = chatRoomBanRepository.findAllByChatId(chatId);
        if (bans.isEmpty()) {
            return List.of();
        }

        List<UUID> bannedUserIds = bans.stream()
                .map(ChatRoomBan::getUserId)
                .distinct()
                .toList();
        Map<UUID, UserAccount> usersById = findUsersById(bannedUserIds);
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(bannedUserIds);
        LinkedHashMap<UUID, ParticipantResponse> participantsById = new LinkedHashMap<>();

        bans.forEach(ban -> {
            UUID bannedUserId = ban.getUserId();
            UserAccount bannedUser = usersById.get(bannedUserId);
            ParticipantResponse participant = bannedUser != null
                    ? authService.toParticipant(
                            bannedUser,
                            onlineByUserId.getOrDefault(bannedUserId, false)
                    )
                    : authService.toDeletedParticipant(
                            bannedUserId,
                            onlineByUserId.getOrDefault(bannedUserId, false)
                    );
            participantsById.putIfAbsent(bannedUserId, participant);
        });
        return List.copyOf(participantsById.values());
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
        ChatParticipant moderatorMembership = chatParticipantRepository.findByChatIdAndUserId(chatId, moderatorUser.getId())
                .orElse(null);
        if (moderatorMembership == null || !isActiveMembership(chatId, moderatorMembership)) {
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
        scheduleChatUpdated(chatId);
    }

    @Transactional
    public ChatSummaryResponse transferGroupOwnership(String username, UUID chatId, String nextOwnerUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support owner transfer");
        }
        requireGroupOwner(room, currentUser);

        UserAccount nextOwner = authService.requireExistingUser(nextOwnerUsername);
        if (nextOwner.getId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You already own this group");
        }

        ChatParticipant nextOwnerMembership = chatParticipantRepository.findByChatIdAndUserId(chatId, nextOwner.getId())
                .orElse(null);
        if (nextOwnerMembership == null || !isActiveMembership(chatId, nextOwnerMembership)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not an active member of this group");
        }
        if (!chatRoomModeratorRepository.existsByChatIdAndUserId(chatId, nextOwner.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only a moderator can become the group owner");
        }

        room.updateOwnerUserId(nextOwner.getId());
        chatRoomRepository.save(room);
        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, nextOwner.getId());
        chatRoomModeratorRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseGet(() -> chatRoomModeratorRepository.save(
                        new ChatRoomModerator(UUID.randomUUID(), chatId, currentUser.getId(), currentUser.getId(), Instant.now())
                ));
        scheduleChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
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
        scheduleChatUpdated(chatId);
    }

    @Transactional
    public void removeGroupParticipant(String username, UUID chatId, String participantUsername) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat does not support participant removal");
        }
        GroupRole currentRole = resolveGroupModeratorRoleOrThrow(room, currentUser);

        UserAccount participant = authService.requireExistingUser(participantUsername);
        assertCanModerateTarget(room, currentUser, currentRole, participant, "remove");

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, participant.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not a member of this group"));
        membership.leave(Instant.now());
        chatRoomModeratorRepository.deleteByChatIdAndUserId(chatId, participant.getId());
        persistMembershipVersionIncrement(room);
        scheduleChatUpdated(chatId);
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

        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElse(null);
        boolean membershipActivated = false;
        if (membership == null) {
            Instant joinedAt = Instant.now();
            membership = new ChatParticipant(UUID.randomUUID(), chatId, currentUser.getId(), joinedAt);
            grantPrejoinHistoryAccessIfEnabled(room, membership, joinedAt);
            chatParticipantRepository.save(membership);
            membershipActivated = true;
        } else if (!membership.isActive()) {
            membership.restoreMembership();
            membershipActivated = true;
        }
        if (membershipActivated) {
            persistMembershipVersionIncrement(room);
        }

        restoreDeletedChatStateForUsers(chatId, List.of(currentUser.getId()));
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
        if (membershipActivated) {
            scheduleChatUpdated(chatId);
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
        requireGroupModeratorOrOwnerAccess(room, currentUser);
        return room;
    }

    public void assertChatInteractionAllowed(ChatRoom room, UserAccount currentUser) {
        if (!room.isDirect()) {
            ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(room.getId(), currentUser.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
            if (!isActiveMembership(room.getId(), membership)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This group is available in read-only history mode");
            }
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

    @Transactional
    public void clearReactionAttention(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireChatMembership(chatId, currentUser);
        clearReactionAttention(chatId, currentUser.getId());
    }

    @Transactional
    void clearReactionAttention(UUID chatId, UUID userId) {
        if (chatId == null || userId == null) {
            return;
        }

        userChatReactionAttentionRepository.deleteByUserIdAndChatId(userId, chatId);
    }

    public List<UserAccount> findParticipants(UUID chatId) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        List<ChatParticipant> activeMemberships = resolveActiveMemberships(chatId, memberships);
        Map<UUID, UserAccount> usersById = findUsersById(
                activeMemberships.stream().map(ChatParticipant::getUserId).toList()
        );

        return activeMemberships.stream()
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
        List<ChatParticipant> activeMemberships = resolveActiveMemberships(chatId, memberships);
        List<UUID> activeParticipantUserIds = activeMemberships.stream()
                .map(ChatParticipant::getUserId)
                .toList();
        Map<UUID, UserAccount> usersById = findUsersById(
                participantUserIds
        );
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(activeParticipantUserIds);
        List<ParticipantResponse> members = buildParticipantResponses(activeMemberships, usersById, onlineByUserId);
        List<UUID> moderatorUserIds = resolveModeratorUserIds(chatId).stream()
                .filter(activeParticipantUserIds::contains)
                .toList();
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
        Map<UUID, ChatMessage> lastMessagesByUserId = resolveLastVisibleMessagesForAudience(
                room,
                memberships,
                audience
        );

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

    void broadcastChatRemoval(UUID chatId, Collection<String> usernames) {
        if (usernames == null || usernames.isEmpty()) {
            return;
        }

        ChatRemovalEventResponse response = new ChatRemovalEventResponse(chatId);
        usernames.forEach(username -> realtimeMessagingGateway.sendToUser(
                username,
                "/queue/chat-removals",
                response
        ));
    }

    @Transactional
    public ChatSummaryResponse updatePinnedMessage(String username, UUID chatId, UUID messageId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = requireChatMembership(chatId, currentUser);

        if (messageId == null) {
            chatPinnedMessageRepository.deleteByChatId(chatId);
            syncPinnedMessageAlias(room);
        } else {
            ChatMessage message = chatMessageRepository.findById(messageId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));
            if (!message.getChatId().equals(chatId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message must belong to the same chat");
            }
            chatPinnedMessageRepository.findByChatIdAndMessageId(chatId, messageId)
                    .ifPresentOrElse(
                            existingPinnedMessage ->
                                    chatPinnedMessageRepository.deleteByChatIdAndMessageId(chatId, messageId),
                            () -> chatPinnedMessageRepository.save(
                                    new ChatPinnedMessage(
                                            UUID.randomUUID(),
                                            chatId,
                                            message.getId(),
                                            Instant.now()
                                    )
                            )
                    );
            syncPinnedMessageAlias(room);
        }

        scheduleChatUpdated(chatId);
        return getChatSummaryForUser(chatId, currentUser);
    }

    @Transactional
    public void removePinnedMessages(ChatRoom room, Collection<UUID> messageIds) {
        if (room == null || messageIds == null || messageIds.isEmpty()) {
            return;
        }

        List<UUID> uniqueMessageIds = messageIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (uniqueMessageIds.isEmpty()) {
            return;
        }

        chatPinnedMessageRepository.deleteByChatIdAndMessageIdIn(room.getId(), uniqueMessageIds);
        syncPinnedMessageAlias(room);
    }

    private void syncPinnedMessageAlias(ChatRoom room) {
        if (room == null) {
            return;
        }

        ChatPinnedMessage primaryPinnedMessage = chatPinnedMessageRepository
                .findAllByChatIdOrderByPinnedAtDescIdDesc(room.getId())
                .stream()
                .findFirst()
                .orElse(null);

        if (primaryPinnedMessage == null) {
            if (room.getPinnedMessageId() == null && room.getPinnedAt() == null) {
                return;
            }
            room.clearPinnedMessage();
            chatRoomRepository.save(room);
            return;
        }

        if (Objects.equals(room.getPinnedMessageId(), primaryPinnedMessage.getMessageId())
                && Objects.equals(room.getPinnedAt(), primaryPinnedMessage.getPinnedAt())) {
            return;
        }

        room.pinMessage(primaryPinnedMessage.getMessageId(), primaryPinnedMessage.getPinnedAt());
        chatRoomRepository.save(room);
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
        addParticipants(room, currentUser, List.of(participant));
        persistMembershipVersionIncrement(room);
        scheduleChatUpdated(room.getId());
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
    public void reopenDeletedChatForUser(ChatRoom room, UserAccount currentUser) {
        if (room == null || currentUser == null) {
            return;
        }

        UserDeletedChat deletedChat = userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), room.getId())
                .orElse(null);
        if (deletedChat == null) {
            return;
        }

        if (room.isDirect()) {
            ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(room.getId(), currentUser.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied for this chat"));
            Instant reopenedVisibleFrom = deletedChat.getDeletedAt().isAfter(membership.getJoinedAt())
                    ? deletedChat.getDeletedAt()
                    : membership.getJoinedAt();
            membership.rejoin(reopenedVisibleFrom);
        }

        userDeletedChatRepository.delete(deletedChat);
        userArchivedChatRepository.deleteByUserIdAndChatId(currentUser.getId(), room.getId());
    }

    @Transactional
    public void restoreDeletedChatStateForUsers(UUID chatId, Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }

        userDeletedChatRepository.deleteByChatIdAndUserIdIn(chatId, userIds);
    }

    private ChatSummaryResponse toSummary(
            ChatRoom room,
            UUID currentUserId,
            int unreadCount
    ) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId());
        List<ChatParticipant> activeMemberships = resolveActiveMemberships(room.getId(), memberships);
        List<UUID> participantUserIds = memberships.stream()
                .map(ChatParticipant::getUserId)
                .toList();
        Map<UUID, UserAccount> usersById = findUsersById(
                participantUserIds
        );
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(
                activeMemberships.stream().map(ChatParticipant::getUserId).toList()
        );
        return toSummary(
                room,
                currentUserId,
                usersById,
                unreadCount,
                memberships,
                resolveModeratorUserIds(room.getId()),
                buildParticipantResponses(activeMemberships, usersById, onlineByUserId)
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
        ChatParticipant currentMembership = memberships.stream()
                .filter(membership -> membership.getUserId().equals(currentUserId))
                .findFirst()
                .orElse(null);
        return toSummary(
                room,
                currentUserId,
                usersById,
                unreadCount,
                memberships,
                moderatorUserIds,
                members,
                findLatestVisibleMessage(room, currentMembership, currentUserId)
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
        List<ChatParticipant> activeMemberships = resolveActiveMemberships(room.getId(), memberships);
        List<UUID> activeUserIds = activeMemberships.stream()
                .map(ChatParticipant::getUserId)
                .toList();
        List<UUID> activeModeratorUserIds = moderatorUserIds.stream()
                .filter(activeUserIds::contains)
                .toList();
        UUID ownerUserId = resolveGroupOwnerUserId(room, activeMemberships);
        ChatParticipant currentMembership = memberships.stream()
                .filter(membership -> membership.getUserId().equals(currentUserId))
                .findFirst()
                .orElse(null);
        List<MessageSnippetResponse> pinnedMessages = buildPinnedSnippets(
                room,
                currentMembership,
                currentUserId,
                usersById
        );
        MessageSnippetResponse pinnedMessage = pinnedMessages.isEmpty() ? null : pinnedMessages.get(0);
        Instant updatedAt = lastMessage != null ? lastMessage.getCreatedAt() : room.getCreatedAt();
        boolean lastMessageHasReactions = hasReactions(lastMessage, currentUserId);
        UserChatReactionAttention reactionAttentionRecord = userChatReactionAttentionRepository
                .findByUserIdAndChatId(currentUserId, room.getId())
                .orElse(null);
        boolean reactionAttention = reactionAttentionRecord != null;
        UUID reactionAttentionMessageId = reactionAttentionRecord != null
                ? reactionAttentionRecord.getMessageId()
                : null;

        String title;
        if (room.isDirect()) {
            title = members.stream()
                    .filter(member -> !member.id().equals(currentUserId))
                    .map(ParticipantResponse::displayName)
                    .findFirst()
                    .orElse(AuthService.DELETED_USER_DISPLAY_NAME);
        } else {
            title = room.getTitle() != null && !room.getTitle().isBlank() ? room.getTitle() : "Untitled room";
        }

        return new ChatSummaryResponse(
                room.getId(),
                room.isDirect(),
                title,
                room.isDirect() ? null : room.getAvatarUrl(),
                buildChatVersion(
                        room,
                        title,
                        ownerUserId,
                        activeModeratorUserIds,
                        lastMessage,
                          lastMessageHasReactions,
                          reactionAttention,
                          updatedAt,
                          unreadCount,
                          pinnedMessages
                  ),
                  buildChatCapabilities(room, currentUserId, ownerUserId, activeModeratorUserIds, currentMembership),
                  room.isDirect() ? null : ownerUserId,
                room.isDirect() ? List.of() : activeModeratorUserIds,
                members,
                lastMessage != null ? summarizeLastMessage(lastMessage) : null,
                lastMessage != null ? lastMessage.getCreatedAt() : null,
                lastMessageHasReactions,
                reactionAttention,
                reactionAttentionMessageId,
                lastMessage != null ? lastMessage.getServerOrder() : null,
                  updatedAt,
                  unreadCount,
                  room.getMembershipVersion(),
                  pinnedMessage,
                  pinnedMessages,
                  room.isDirect() ? null : room.getPrejoinHistoryPolicy().name()
          );
      }

    private String buildChatVersion(
            ChatRoom room,
            String title,
            UUID ownerUserId,
            List<UUID> moderatorUserIds,
            ChatMessage lastMessage,
            boolean lastMessageHasReactions,
            boolean reactionAttention,
            Instant updatedAt,
            int unreadCount,
            List<MessageSnippetResponse> pinnedMessages
    ) {
        String moderatorsVersion = moderatorUserIds.stream()
                .map(UUID::toString)
                .sorted()
                .collect(Collectors.joining(","));
        String pinnedMessagesVersion = pinnedMessages.isEmpty()
                ? "-"
                : pinnedMessages.stream()
                        .map(pinnedMessage -> String.join(
                                "~",
                                pinnedMessage.id().toString(),
                                pinnedMessage.createdAt().toString(),
                                String.valueOf(pinnedMessage.serverOrder()),
                                pinnedMessage.preview()
                        ))
                        .collect(Collectors.joining(","));
        return String.join(
                "|",
                room.getId().toString(),
                room.isDirect() ? "direct" : "group",
                String.valueOf(title),
                String.valueOf(room.getAvatarUrl()),
                String.valueOf(updatedAt),
                Boolean.toString(lastMessageHasReactions),
                Boolean.toString(reactionAttention),
                Long.toString(lastMessage != null && lastMessage.getServerOrder() != null ? lastMessage.getServerOrder() : Long.MIN_VALUE),
                Long.toString(room.getMembershipVersion()),
                String.valueOf(room.getPinnedMessageId()),
                String.valueOf(room.getPinnedAt()),
                String.valueOf(ownerUserId),
                moderatorsVersion,
                Integer.toString(unreadCount),
                String.valueOf(room.getPrejoinHistoryPolicy()),
                pinnedMessagesVersion
        );
    }

    private ChatCapabilitiesResponse buildChatCapabilities(
            ChatRoom room,
            UUID currentUserId,
            UUID ownerUserId,
            List<UUID> moderatorUserIds,
            ChatParticipant currentMembership
    ) {
        if (room.isDirect() || currentMembership == null || !isActiveMembership(room.getId(), currentMembership)) {
            return new ChatCapabilitiesResponse(false, false, false, false, false, false, false, false);
        }

        boolean isOwner = Objects.equals(ownerUserId, currentUserId);
        boolean isModerator = moderatorUserIds.contains(currentUserId);
        return new ChatCapabilitiesResponse(
                isOwner || isModerator,
                isOwner,
                isOwner || isModerator,
                isOwner,
                isOwner,
                isOwner || isModerator,
                isOwner,
                !isOwner
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
                .map(membership -> {
                    UserAccount user = usersById.get(membership.getUserId());
                    if (user != null) {
                        return authService.toParticipant(
                                user,
                                onlineByUserId.getOrDefault(user.getId(), false)
                        );
                    }
                    return authService.toDeletedParticipant(membership.getUserId());
                })
                .toList();
    }

    private int loadUnreadCount(UUID chatId, UUID userId) {
        return loadUnreadCounts(List.of(chatId), userId).getOrDefault(chatId, 0);
    }

    private ChatMessage findLatestVisibleMessage(ChatRoom room, ChatParticipant membership, UUID userId) {
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);
        Instant visibleTo = resolveVisibleHistoryEnd(room, membership);
        return loadLatestVisibleMessages(room.getId(), userId, visibleFrom, visibleTo).stream()
                .findFirst()
                .orElse(null);
    }

    private ChatMessage findLatestMessage(UUID chatId) {
        return chatMessageRepository.findLatestByChatId(
                        chatId,
                        PageRequest.of(0, 1)
                ).stream()
                .findFirst()
                .orElse(null);
    }

    private Map<UUID, ChatMessage> resolveLastVisibleMessagesForAudience(
            ChatRoom room,
            List<ChatParticipant> memberships,
            List<UserAccount> audience
    ) {
        Map<UUID, ChatMessage> lastMessagesByUserId = new LinkedHashMap<>();
        if (audience.isEmpty()) {
            return lastMessagesByUserId;
        }

        Map<UUID, ChatParticipant> membershipsByUserId = memberships.stream()
                .collect(Collectors.toMap(ChatParticipant::getUserId, Function.identity()));
        ChatMessage sharedLatestMessage = findLatestMessage(room.getId());
        Set<UUID> fallbackUserIds = new LinkedHashSet<>();
        List<UUID> audienceUserIds = audience.stream()
                .map(UserAccount::getId)
                .toList();
        Set<UUID> deletedSharedLatestUserIds = sharedLatestMessage == null
                ? Set.of()
                : userDeletedMessageRepository.findAllByMessageIdAndUserIdIn(
                                sharedLatestMessage.getId(),
                                audienceUserIds
                        ).stream()
                        .map(UserDeletedMessage::getUserId)
                        .collect(Collectors.toSet());

        audience.forEach(user -> {
            ChatParticipant membership = membershipsByUserId.get(user.getId());
            Instant visibleFrom = resolveVisibleHistoryStart(room, membership);
            Instant visibleTo = resolveVisibleHistoryEnd(room, membership);
            boolean canUseSharedLatest = sharedLatestMessage != null
                    && !deletedSharedLatestUserIds.contains(user.getId())
                    && (visibleFrom == null || !sharedLatestMessage.getCreatedAt().isBefore(visibleFrom))
                    && (visibleTo == null || !sharedLatestMessage.getCreatedAt().isAfter(visibleTo));
            if (canUseSharedLatest) {
                lastMessagesByUserId.put(user.getId(), sharedLatestMessage);
                return;
            }

            fallbackUserIds.add(user.getId());
        });

        fallbackUserIds.forEach(userId -> lastMessagesByUserId.put(
                userId,
                findLatestVisibleMessage(room, membershipsByUserId.get(userId), userId)
        ));
        return lastMessagesByUserId;
    }

    private List<MessageSnippetResponse> buildPinnedSnippets(
            ChatRoom room,
            ChatParticipant currentMembership,
            UUID currentUserId,
            Map<UUID, UserAccount> usersById
    ) {
        List<ChatPinnedMessage> pinnedEntries = chatPinnedMessageRepository
                .findAllByChatIdOrderByPinnedAtDescIdDesc(room.getId());
        if (pinnedEntries.isEmpty()) {
            return List.of();
        }

        List<UUID> pinnedMessageIds = pinnedEntries.stream()
                .map(ChatPinnedMessage::getMessageId)
                .distinct()
                .toList();
        Map<UUID, ChatMessage> pinnedMessagesById = chatMessageRepository.findAllById(pinnedMessageIds).stream()
                .collect(Collectors.toMap(ChatMessage::getId, Function.identity()));
        Set<UUID> deletedPinnedMessageIds = userDeletedMessageRepository
                .findAllByUserIdAndMessageIdIn(currentUserId, pinnedMessageIds)
                .stream()
                .map(UserDeletedMessage::getMessageId)
                .collect(Collectors.toSet());
        Set<UUID> missingSenderIds = pinnedMessagesById.values().stream()
                .map(ChatMessage::getSenderId)
                .filter(senderId -> !usersById.containsKey(senderId))
                .collect(Collectors.toSet());
        Map<UUID, UserAccount> resolvedUsersById = new LinkedHashMap<>(usersById);
        if (!missingSenderIds.isEmpty()) {
            userAccountRepository.findAllByIdIn(missingSenderIds)
                    .forEach(user -> resolvedUsersById.put(user.getId(), user));
        }
        Instant visibleFrom = resolveVisibleHistoryStart(room, currentMembership);
        Instant visibleTo = resolveVisibleHistoryEnd(room, currentMembership);

        return pinnedEntries.stream()
                .map(pinnedEntry -> buildPinnedSnippet(
                        room,
                        pinnedMessagesById.get(pinnedEntry.getMessageId()),
                        deletedPinnedMessageIds,
                        visibleFrom,
                        visibleTo,
                        resolvedUsersById
                ))
                .filter(Objects::nonNull)
                .toList();
    }

    private MessageSnippetResponse buildPinnedSnippet(
            ChatRoom room,
            ChatMessage pinnedMessage,
            Set<UUID> deletedPinnedMessageIds,
            Instant visibleFrom,
            Instant visibleTo,
            Map<UUID, UserAccount> usersById
    ) {
        if (pinnedMessage == null || deletedPinnedMessageIds.contains(pinnedMessage.getId())) {
            return null;
        }
        if (!pinnedMessage.getChatId().equals(room.getId())) {
            return null;
        }
        if (visibleFrom != null && pinnedMessage.getCreatedAt().isBefore(visibleFrom)) {
            return null;
        }
        if (visibleTo != null && pinnedMessage.getCreatedAt().isAfter(visibleTo)) {
            return null;
        }

        UserAccount sender = usersById.get(pinnedMessage.getSenderId());
        return new MessageSnippetResponse(
                pinnedMessage.getId(),
                sender != null
                        ? authService.toParticipant(sender)
                        : authService.toDeletedParticipant(pinnedMessage.getSenderId()),
                pinnedMessage.getCreatedAt(),
                summarizeLastMessage(pinnedMessage),
                pinnedMessage.getServerOrder()
        );
    }

    private String summarizeLastMessage(ChatMessage lastMessage) {
        return messagePreviewService.summarizeMessagePreview(lastMessage);
    }

    private boolean hasReactions(ChatMessage message, UUID currentUserId) {
        if (message == null || message.getId() == null) {
            return false;
        }

        return messageReactionRepository.findAllByMessageIdIn(List.of(message.getId())).stream()
                .anyMatch(reaction -> !Objects.equals(reaction.getUserId(), currentUserId));
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

    private void addParticipants(ChatRoom room, UserAccount currentUser, List<UserAccount> participants) {
        Instant joinedAt = Instant.now();
        ChatParticipant ownerMembership = new ChatParticipant(
                UUID.randomUUID(),
                room.getId(),
                currentUser.getId(),
                joinedAt
        );
        if (!room.isDirect()) {
            grantPrejoinHistoryAccessIfEnabled(room, ownerMembership, joinedAt);
        }
        chatParticipantRepository.save(ownerMembership);

        for (UserAccount participant : participants) {
            ChatParticipant membership = new ChatParticipant(
                    UUID.randomUUID(),
                    room.getId(),
                    participant.getId(),
                    joinedAt
            );
            if (!room.isDirect()) {
                grantPrejoinHistoryAccessIfEnabled(room, membership, joinedAt);
            }
            chatParticipantRepository.save(membership);
        }
    }

    private void scheduleChatUpdated(UUID chatId) {
        eventPublisher.publishEvent(new ChatUpdatedDeferredEvent(chatId));
    }

    private void persistMembershipVersionIncrement(ChatRoom room) {
        if (room == null) {
            return;
        }

        room.incrementMembershipVersion();
        chatRoomRepository.save(room);
    }

    private void scheduleChatRemoval(UUID chatId, Collection<String> usernames) {
        if (usernames == null || usernames.isEmpty()) {
            return;
        }

        eventPublisher.publishEvent(new ChatRemovalDeferredEvent(
                chatId,
                usernames.stream()
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList()
        ));
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
        if (!hasGroupOwnerAccess(room, currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the group owner can manage this group");
        }
    }

    public void requireGroupModeratorOrOwnerAccess(ChatRoom room, UserAccount currentUser) {
        resolveGroupModeratorRoleOrThrow(room, currentUser);
    }

    public boolean hasGroupModeratorOrOwnerAccess(ChatRoom room, UserAccount currentUser) {
        if (room == null || room.isDirect()) {
            return false;
        }

        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                resolveActiveMemberships(
                        room.getId(),
                        chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
                )
        );
        return Objects.equals(ownerUserId, currentUser.getId())
                || chatRoomModeratorRepository.existsByChatIdAndUserId(room.getId(), currentUser.getId());
    }

    private boolean hasGroupOwnerAccess(ChatRoom room, UserAccount currentUser) {
        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                resolveActiveMemberships(
                        room.getId(),
                        chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
                )
        );
        return Objects.equals(ownerUserId, currentUser.getId());
    }

    private GroupRole resolveGroupModeratorRoleOrThrow(ChatRoom room, UserAccount currentUser) {
        UUID ownerUserId = resolveGroupOwnerUserId(
                room,
                resolveActiveMemberships(
                        room.getId(),
                        chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId())
                )
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

    private boolean isActiveMembership(UUID chatId, ChatParticipant membership) {
        return membership != null
                && membership.isActive()
                && !chatRoomBanRepository.existsByChatIdAndUserId(chatId, membership.getUserId());
    }

    private List<ChatParticipant> resolveActiveMemberships(UUID chatId, List<ChatParticipant> memberships) {
        if (memberships.isEmpty()) {
            return List.of();
        }

        Set<UUID> bannedUserIds = chatRoomBanRepository.findAllByChatId(chatId).stream()
                .map(ChatRoomBan::getUserId)
                .collect(Collectors.toSet());
        return memberships.stream()
                .filter(ChatParticipant::isActive)
                .filter(membership -> !bannedUserIds.contains(membership.getUserId()))
                .toList();
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
        ChatParticipant targetMembership = chatParticipantRepository.findByChatIdAndUserId(room.getId(), targetUser.getId())
                .orElse(null);
        if (targetMembership == null || !isActiveMembership(room.getId(), targetMembership)) {
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

    private ChatPrejoinHistoryPolicy resolvePrejoinHistoryPolicy(
            String value,
            ChatPrejoinHistoryPolicy fallback
    ) {
        if (value == null || value.isBlank()) {
            return fallback == null ? ChatPrejoinHistoryPolicy.JOIN_ONLY : fallback;
        }

        try {
            return ChatPrejoinHistoryPolicy.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group history policy is invalid");
        }
    }

    private void grantPrejoinHistoryAccessIfEnabled(
            ChatRoom room,
            ChatParticipant membership,
            Instant grantedAt
    ) {
        if (room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY) {
            membership.grantPrejoinHistoryAccess(grantedAt);
        }
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room == null || membership == null) {
            return null;
        }
        if (room.isDirect()) {
            return membership.getJoinedAt();
        }
        if (room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY) {
            return null;
        }
        if (membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    private Instant resolveVisibleHistoryEnd(ChatRoom room, ChatParticipant membership) {
        if (room == null || membership == null || room.isDirect()) {
            return null;
        }

        Instant visibleTo = membership.getLeftAt();
        ChatRoomBan ban = chatRoomBanRepository.findByChatIdAndUserId(room.getId(), membership.getUserId()).orElse(null);
        if (ban == null) {
            return visibleTo;
        }
        if (visibleTo == null) {
            return ban.getCreatedAt();
        }
        return visibleTo.isBefore(ban.getCreatedAt()) ? visibleTo : ban.getCreatedAt();
    }

    private List<ChatMessage> loadLatestVisibleMessages(
            UUID chatId,
            UUID userId,
            Instant visibleFrom,
            Instant visibleTo
    ) {
        PageRequest pageRequest = PageRequest.of(0, 1);
        if (visibleFrom != null && visibleTo != null) {
            return chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedBetween(
                    chatId,
                    userId,
                    visibleFrom,
                    visibleTo,
                    pageRequest
            );
        }
        if (visibleFrom != null) {
            return chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedAfter(
                    chatId,
                    userId,
                    visibleFrom,
                    pageRequest
            );
        }
        if (visibleTo != null) {
            return chatMessageRepository.findLatestVisibleByChatIdAndUserIdCreatedBefore(
                    chatId,
                    userId,
                    visibleTo,
                    pageRequest
            );
        }
        return chatMessageRepository.findLatestVisibleByChatIdAndUserId(
                chatId,
                userId,
                pageRequest
        );
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
