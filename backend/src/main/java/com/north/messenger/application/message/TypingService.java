package com.north.messenger.application.message;

import com.north.messenger.api.dto.TypingEventResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.auth.UserDisconnectedEvent;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TypingService {

    private final AuthService authService;
    private final ChatService chatService;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final TypingStateStore typingStateStore;
    private final long activeTypingWindowMillis;

    public TypingService(
            AuthService authService,
            ChatService chatService,
            RealtimeMessagingGateway realtimeMessagingGateway,
            TypingStateStore typingStateStore,
            @Value("${app.realtime.typing-active-window-ms:10000}") long activeTypingWindowMillis
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.typingStateStore = typingStateStore;
        this.activeTypingWindowMillis = activeTypingWindowMillis;
    }

    public void publishTyping(UUID chatId, String username, boolean typing) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        var room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);
        Instant now = Instant.now();

        if (typing) {
            typingStateStore.markTyping(chatId, currentUser.getId(), now);
        } else {
            typingStateStore.clearTyping(chatId, currentUser.getId());
        }

        TypingEventResponse response = new TypingEventResponse(
                chatId,
                authService.toParticipant(currentUser),
                typing,
                now
        );
        realtimeMessagingGateway.sendToTopic("/topic/chats." + chatId + ".typing", response);
    }

    public List<ParticipantResponse> listTypingParticipants(UUID chatId, String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        Instant threshold = Instant.now().minusMillis(activeTypingWindowMillis);
        Set<UUID> typingUserIds = typingStateStore.listTypingUserIds(chatId, threshold);
        if (typingUserIds.isEmpty()) {
            return List.of();
        }

        return chatService.findParticipants(chatId).stream()
                .filter(participant -> !participant.getId().equals(currentUser.getId()))
                .filter(participant -> typingUserIds.contains(participant.getId()))
                .map(authService::toParticipant)
                .sorted(Comparator.comparing(ParticipantResponse::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Clears all typing state for a user when their WebSocket session closes
     * (normal close, network error, or session revocation). This ensures the
     * typing indicator disappears for other participants immediately rather than
     * waiting for the expiry window to elapse.
     */
    @EventListener
    public void onUserDisconnected(UserDisconnectedEvent event) {
        typingStateStore.clearAllTypingForUser(event.userId());
    }

    @Scheduled(fixedDelay = 30_000L)
    @Transactional
    public void purgeExpiredTypingEntries() {
        purgeExpiredTypingEntries(Instant.now().minusMillis(activeTypingWindowMillis));
    }

    void purgeExpiredTypingEntries(Instant threshold) {
        typingStateStore.purgeExpiredEntries(threshold);
    }
}
