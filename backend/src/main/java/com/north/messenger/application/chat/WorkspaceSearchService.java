package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.api.dto.WorkspaceSearchResponse;
import com.north.messenger.application.auth.AuthService;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class WorkspaceSearchService {

    private static final int SEARCH_RESULT_LIMIT = 8;

    private final AuthService authService;
    private final ChatService chatService;
    private final VideoConferenceService videoConferenceService;

    public WorkspaceSearchService(
            AuthService authService,
            ChatService chatService,
            VideoConferenceService videoConferenceService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.videoConferenceService = videoConferenceService;
    }

    public WorkspaceSearchResponse search(String username, String query) {
        String normalizedQuery = normalizeQuery(query);
        if (normalizedQuery.isBlank()) {
            return new WorkspaceSearchResponse(List.of(), List.of(), List.of(), List.of());
        }

        List<UserProfileResponse> users = authService.searchUsers(username, normalizedQuery);
        List<UserProfileResponse> contacts = authService.listContacts(username).stream()
                .filter(contact -> matchesUser(contact, normalizedQuery))
                .limit(SEARCH_RESULT_LIMIT)
                .toList();
        Set<UUID> archivedChatIds = Set.copyOf(chatService.listArchivedChatIds(username));
        List<ChatSummaryResponse> chats = chatService.listChats(username).stream()
                .filter(chat -> !archivedChatIds.contains(chat.id()))
                .filter(chat -> !chat.direct() || chat.lastMessageAt() != null)
                .filter(chat -> matchesChat(chat, normalizedQuery))
                .limit(SEARCH_RESULT_LIMIT)
                .toList();
        List<VideoConferenceResponse> conferences = videoConferenceService.listConferences(username).stream()
                .filter(conference -> matchesConference(conference, normalizedQuery))
                .limit(SEARCH_RESULT_LIMIT)
                .toList();

        return new WorkspaceSearchResponse(users, contacts, chats, conferences);
    }

    private String normalizeQuery(String query) {
        return query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
    }

    private boolean matchesUser(UserProfileResponse user, String normalizedQuery) {
        return matchesText(user.username(), normalizedQuery)
                || matchesText(user.displayName(), normalizedQuery);
    }

    private boolean matchesChat(ChatSummaryResponse chat, String normalizedQuery) {
        if (matchesText(chat.title(), normalizedQuery)) {
            return true;
        }
        return chat.members().stream().anyMatch(member -> matchesParticipant(member, normalizedQuery));
    }

    private boolean matchesConference(VideoConferenceResponse conference, String normalizedQuery) {
        if (matchesText(conference.title(), normalizedQuery)) {
            return true;
        }
        if (matchesParticipant(conference.createdBy(), normalizedQuery)) {
            return true;
        }
        return conference.participants().stream().anyMatch(participant -> matchesParticipant(participant, normalizedQuery));
    }

    private boolean matchesParticipant(ParticipantResponse participant, String normalizedQuery) {
        return matchesText(participant.username(), normalizedQuery)
                || matchesText(participant.displayName(), normalizedQuery);
    }

    private boolean matchesText(String value, String normalizedQuery) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(normalizedQuery);
    }
}
