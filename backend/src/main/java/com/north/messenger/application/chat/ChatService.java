package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ChatDraftResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.AddGroupParticipantsRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateChatDraftRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserArchivedChat;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserChatDraft;
import com.north.messenger.domain.repository.UserArchivedChatRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserChatDraftRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatService {

    private static final String ENCRYPTED_MESSAGE_PLACEHOLDER = "Encrypted message";

    private final AuthService authService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserChatDraftRepository userChatDraftRepository;
    private final UserArchivedChatRepository userArchivedChatRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatMessageRepository chatMessageRepository,
            MessageReceiptRepository messageReceiptRepository,
            UserAccountRepository userAccountRepository,
            UserChatDraftRepository userChatDraftRepository,
            UserArchivedChatRepository userArchivedChatRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.userAccountRepository = userAccountRepository;
        this.userChatDraftRepository = userChatDraftRepository;
        this.userArchivedChatRepository = userArchivedChatRepository;
        this.messagingTemplate = messagingTemplate;
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

        Map<UUID, ChatRoom> roomsById = chatRoomRepository.findAllById(chatIds).stream()
                .collect(Collectors.toMap(ChatRoom::getId, Function.identity()));
        Map<UUID, Integer> unreadCountsByChatId = loadUnreadCounts(chatIds, currentUser.getId());

        List<ChatSummaryResponse> chats = new ArrayList<>();
        for (UUID chatId : chatIds) {
            ChatRoom room = roomsById.get(chatId);
            if (room != null) {
                chats.add(toSummary(room, currentUser.getId(), unreadCountsByChatId.getOrDefault(chatId, 0)));
            }
        }

        chats.sort(Comparator.comparing(ChatSummaryResponse::updatedAt).reversed());
        return chats;
    }

    public List<UUID> listArchivedChatIds(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        return userArchivedChatRepository.findAllByUserIdOrderByArchivedAtDesc(currentUser.getId()).stream()
                .map(UserArchivedChat::getChatId)
                .toList();
    }

    public List<ChatDraftResponse> listDrafts(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        LinkedHashSet<UUID> accessibleChatIds = chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(currentUser.getId()).stream()
                .map(ChatParticipant::getChatId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (accessibleChatIds.isEmpty()) {
            return List.of();
        }

        return userChatDraftRepository.findAllByUserIdOrderByUpdatedAtDesc(currentUser.getId()).stream()
                .filter(draft -> accessibleChatIds.contains(draft.getChatId()))
                .map(draft -> new ChatDraftResponse(draft.getChatId(), draft.getContent(), draft.getUpdatedAt()))
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
    public void updateDraft(String username, UUID chatId, UpdateChatDraftRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireChatMembership(chatId, currentUser);

        String content = request.content();
        if (content.isBlank()) {
            userChatDraftRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                    .ifPresent(userChatDraftRepository::delete);
            return;
        }

        Instant now = Instant.now();
        userChatDraftRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                .ifPresentOrElse(
                        draft -> draft.updateContent(content, now),
                        () -> userChatDraftRepository.save(
                                new UserChatDraft(UUID.randomUUID(), currentUser.getId(), chatId, content, now)
                        )
                );
    }

    @Transactional
    public ChatSummaryResponse createDirectChat(String username, CreateDirectChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        UserAccount participant = authService.requireExistingUser(request.participantUsername());

        if (currentUser.getId().equals(participant.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot create a direct chat with yourself");
        }

        return chatRoomRepository.findDirectChatByParticipantIds(currentUser.getId(), participant.getId())
                .map(room -> toSummary(room, currentUser.getId()))
                .orElseGet(() -> createNewDirectChat(currentUser, participant));
    }

    @Transactional
    public ChatSummaryResponse createGroupChat(String username, CreateGroupChatRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                request.participantUsernames(),
                currentUser.getUsername(),
                List.of()
        );

        if (normalizedUsernames.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group chat must include at least one other participant"
            );
        }

        List<UserAccount> participants = normalizedUsernames.stream()
                .map(authService::requireExistingUser)
                .toList();

        ChatRoom room = new ChatRoom(
                UUID.randomUUID(),
                request.title().trim(),
                false,
                Instant.now()
        );
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

        Instant joinedAt = Instant.now();
        participants.forEach(participant ->
                chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, participant.getId(), joinedAt))
        );
        notifyChatUpdated(chatId);
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
        ChatRoom room = chatRoomRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found"));
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );
        ChatMessage lastMessage = chatMessageRepository.findTopByChatIdAndEncryptionSchemeIsNotNullOrderByCreatedAtDesc(chatId)
                .orElse(null);
        Map<UUID, Integer> unreadCountsByUserId = loadUnreadCountsForUsers(chatId);

        memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .forEach(user -> messagingTemplate.convertAndSendToUser(
                        user.getUsername(),
                        "/queue/chats",
                        toSummary(
                                room,
                                user.getId(),
                                memberships,
                                usersById,
                                lastMessage,
                                unreadCountsByUserId.getOrDefault(user.getId(), 0)
                        )
                ));
    }

    private ChatSummaryResponse createNewDirectChat(UserAccount currentUser, UserAccount participant) {
        ChatRoom room = new ChatRoom(UUID.randomUUID(), null, true, Instant.now());
        chatRoomRepository.save(room);
        addParticipants(room.getId(), currentUser, List.of(participant));
        notifyChatUpdated(room.getId());
        return getChatSummaryForUser(room.getId(), currentUser);
    }

    private ChatSummaryResponse toSummary(ChatRoom room, UUID currentUserId) {
        return toSummary(room, currentUserId, loadUnreadCount(room.getId(), currentUserId));
    }

    private ChatSummaryResponse toSummary(ChatRoom room, UUID currentUserId, int unreadCount) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId());
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );
        ChatMessage lastMessage = chatMessageRepository.findTopByChatIdAndEncryptionSchemeIsNotNullOrderByCreatedAtDesc(room.getId())
                .orElse(null);
        return toSummary(room, currentUserId, memberships, usersById, lastMessage, unreadCount);
    }

    private ChatSummaryResponse toSummary(
            ChatRoom room,
            UUID currentUserId,
            List<ChatParticipant> memberships,
            Map<UUID, UserAccount> usersById,
            ChatMessage lastMessage,
            int unreadCount
    ) {
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );
        List<ParticipantResponse> members = memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .map(user -> authService.toParticipant(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();

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
                members,
                lastMessage != null ? summarizeLastMessage(lastMessage) : null,
                lastMessage != null ? lastMessage.getCreatedAt() : null,
                updatedAt,
                unreadCount
        );
    }

    private int loadUnreadCount(UUID chatId, UUID userId) {
        return loadUnreadCounts(List.of(chatId), userId).getOrDefault(chatId, 0);
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
        participants.forEach(participant ->
                chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, participant.getId(), joinedAt))
        );
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
}
