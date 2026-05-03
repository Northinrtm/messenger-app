package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatDraftResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserChatDraft;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserChatDraftRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatDraftService {

    private final AuthService authService;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final UserDeletedChatRepository userDeletedChatRepository;
    private final UserChatDraftRepository userChatDraftRepository;

    public ChatDraftService(
            AuthService authService,
            ChatRoomRepository chatRoomRepository,
            ChatParticipantRepository chatParticipantRepository,
            UserDeletedChatRepository userDeletedChatRepository,
            UserChatDraftRepository userChatDraftRepository
    ) {
        this.authService = authService;
        this.chatRoomRepository = chatRoomRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.userDeletedChatRepository = userDeletedChatRepository;
        this.userChatDraftRepository = userChatDraftRepository;
    }

    public List<ChatDraftResponse> listOwnDrafts(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        return userChatDraftRepository.findVisibleByUserIdOrderByUpdatedAtDesc(currentUser.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ChatDraftResponse upsertOwnDraft(String username, UUID chatId, String content) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireVisibleChatMembership(chatId, currentUser);

        String normalizedContent = content == null ? "" : content;
        if (normalizedContent.trim().isEmpty()) {
            userChatDraftRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
            return new ChatDraftResponse(chatId, "", Instant.now());
        }

        Instant now = Instant.now();
        UserChatDraft draft = userChatDraftRepository.findByUserIdAndChatId(currentUser.getId(), chatId)
                .map(existing -> {
                    existing.updateContent(normalizedContent, now);
                    return existing;
                })
                .orElseGet(() -> new UserChatDraft(
                        UUID.randomUUID(),
                        currentUser.getId(),
                        chatId,
                        normalizedContent,
                        now
                ));
        userChatDraftRepository.save(draft);
        return toResponse(draft);
    }

    @Transactional
    public void deleteOwnDraft(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        requireVisibleChatMembership(chatId, currentUser);
        userChatDraftRepository.deleteByUserIdAndChatId(currentUser.getId(), chatId);
    }

    private ChatRoom requireVisibleChatMembership(UUID chatId, UserAccount currentUser) {
        ChatRoom room = chatRoomRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found"));
        if (!chatParticipantRepository.existsByChatIdAndUserId(chatId, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found");
        }
        if (userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat not found");
        }
        return room;
    }

    private ChatDraftResponse toResponse(UserChatDraft draft) {
        return new ChatDraftResponse(
                draft.getChatId(),
                draft.getContent(),
                draft.getUpdatedAt()
        );
    }
}
