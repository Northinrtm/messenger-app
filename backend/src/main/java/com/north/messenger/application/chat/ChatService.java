package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
import com.north.messenger.api.dto.CreateGroupChatRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
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

    private final AuthService authService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserAccountRepository userAccountRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatMessageRepository chatMessageRepository,
            UserAccountRepository userAccountRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.userAccountRepository = userAccountRepository;
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

        List<ChatSummaryResponse> chats = new ArrayList<>();
        for (UUID chatId : chatIds) {
            ChatRoom room = roomsById.get(chatId);
            if (room != null) {
                chats.add(toSummary(room, currentUser.getId()));
            }
        }

        chats.sort(Comparator.comparing(ChatSummaryResponse::updatedAt).reversed());
        return chats;
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
        LinkedHashSet<String> normalizedUsernames = request.participantUsernames().stream()
                .map(this::normalizeUsername)
                .filter(candidate -> !candidate.equals(currentUser.getUsername()))
                .collect(Collectors.toCollection(LinkedHashSet::new));

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
        ChatMessage lastMessage = chatMessageRepository.findTopByChatIdOrderByCreatedAtDesc(chatId).orElse(null);

        memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .forEach(user -> messagingTemplate.convertAndSendToUser(
                        user.getUsername(),
                        "/queue/chats",
                        toSummary(room, user.getId(), memberships, usersById, lastMessage)
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
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId());
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream().map(ChatParticipant::getUserId).toList()
        );
        ChatMessage lastMessage = chatMessageRepository.findTopByChatIdOrderByCreatedAtDesc(room.getId()).orElse(null);
        return toSummary(room, currentUserId, memberships, usersById, lastMessage);
    }

    private ChatSummaryResponse toSummary(
            ChatRoom room,
            UUID currentUserId,
            List<ChatParticipant> memberships,
            Map<UUID, UserAccount> usersById,
            ChatMessage lastMessage
    ) {
        List<ParticipantResponse> members = memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .map(authService::toParticipant)
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
                lastMessage != null ? lastMessage.getContent() : null,
                lastMessage != null ? lastMessage.getCreatedAt() : null,
                updatedAt
        );
    }

    private void addParticipants(UUID chatId, UserAccount currentUser, List<UserAccount> participants) {
        Instant joinedAt = Instant.now();
        chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, currentUser.getId(), joinedAt));
        participants.forEach(participant ->
                chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), chatId, participant.getId(), joinedAt))
        );
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
