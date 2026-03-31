package com.north.messenger.application.message;

import com.north.messenger.api.dto.TypingEventResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TypingService {

    private static final long ACTIVE_TYPING_WINDOW_MILLIS = 10_000;

    private final AuthService authService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ConcurrentMap<UUID, ConcurrentMap<UUID, Instant>> typingByChatId = new ConcurrentHashMap<>();

    public TypingService(
            AuthService authService,
            ChatService chatService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    public void publishTyping(UUID chatId, String username, boolean typing) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        Instant now = Instant.now();

        if (typing) {
            typingByChatId.computeIfAbsent(chatId, ignored -> new ConcurrentHashMap<>())
                    .put(currentUser.getId(), now);
        } else {
            removeTypingUser(chatId, currentUser.getId());
        }

        TypingEventResponse response = new TypingEventResponse(
                chatId,
                authService.toParticipant(currentUser),
                typing,
                now
        );
        messagingTemplate.convertAndSend("/topic/chats." + chatId + ".typing", response);
    }

    public List<ParticipantResponse> listTypingParticipants(UUID chatId, String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        Instant threshold = Instant.now().minusMillis(ACTIVE_TYPING_WINDOW_MILLIS);
        cleanupExpiredTypingEntries(chatId, threshold);

        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null || chatTyping.isEmpty()) {
            return List.of();
        }

        return chatService.findParticipants(chatId).stream()
                .filter(participant -> !participant.getId().equals(currentUser.getId()))
                .filter(participant -> chatTyping.containsKey(participant.getId()))
                .map(authService::toParticipant)
                .sorted(Comparator.comparing(ParticipantResponse::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Scheduled(fixedDelay = 30_000L)
    @Transactional
    public void purgeExpiredTypingEntries() {
        purgeExpiredTypingEntries(Instant.now().minusMillis(ACTIVE_TYPING_WINDOW_MILLIS));
    }

    void purgeExpiredTypingEntries(Instant threshold) {
        typingByChatId.forEach((chatId, ignored) -> cleanupExpiredTypingEntries(chatId, threshold));
    }

    private void removeTypingUser(UUID chatId, UUID userId) {
        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null) {
            return;
        }

        chatTyping.remove(userId);
        if (chatTyping.isEmpty()) {
            typingByChatId.remove(chatId, chatTyping);
        }
    }

    private void cleanupExpiredTypingEntries(UUID chatId, Instant threshold) {
        ConcurrentMap<UUID, Instant> chatTyping = typingByChatId.get(chatId);
        if (chatTyping == null || chatTyping.isEmpty()) {
            return;
        }

        chatTyping.entrySet().removeIf(entry -> entry.getValue().isBefore(threshold));
        if (chatTyping.isEmpty()) {
            typingByChatId.remove(chatId, chatTyping);
        }
    }
}
