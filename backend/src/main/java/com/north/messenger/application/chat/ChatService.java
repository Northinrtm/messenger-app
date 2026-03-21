package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.CreateDirectChatRequest;
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
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
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

    public ChatService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatMessageRepository chatMessageRepository,
            UserAccountRepository userAccountRepository
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.userAccountRepository = userAccountRepository;
    }

    public List<ChatSummaryResponse> listChats(String username) {
        UserAccount currentUser = authService.requireUser(username);
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
        UserAccount currentUser = authService.requireUser(username);
        UserAccount participant = authService.requireUser(request.participantUsername());

        if (currentUser.getId().equals(participant.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot create a direct chat with yourself");
        }

        return chatRoomRepository.findDirectChatByParticipantIds(currentUser.getId(), participant.getId())
                .map(room -> toSummary(room, currentUser.getId()))
                .orElseGet(() -> createNewDirectChat(currentUser, participant));
    }

    public ChatRoom requireChatMembership(UUID chatId, String username) {
        UserAccount currentUser = authService.requireUser(username);
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

    private ChatSummaryResponse createNewDirectChat(UserAccount currentUser, UserAccount participant) {
        ChatRoom room = new ChatRoom(UUID.randomUUID(), null, true, Instant.now());
        chatRoomRepository.save(room);
        chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), room.getId(), currentUser.getId(), Instant.now()));
        chatParticipantRepository.save(new ChatParticipant(UUID.randomUUID(), room.getId(), participant.getId(), Instant.now()));
        return toSummary(room, currentUser.getId());
    }

    private ChatSummaryResponse toSummary(ChatRoom room, UUID currentUserId) {
        List<ChatParticipant> memberships = chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(room.getId());
        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(
                        memberships.stream().map(ChatParticipant::getUserId).toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));

        List<ParticipantResponse> members = memberships.stream()
                .map(membership -> authService.toParticipant(usersById.get(membership.getUserId())))
                .toList();

        ChatMessage lastMessage = chatMessageRepository.findTopByChatIdOrderByCreatedAtDesc(room.getId()).orElse(null);
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
}
