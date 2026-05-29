package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.ChatCapabilitiesResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.auth.AuthService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkspaceSearchServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private VideoConferenceService videoConferenceService;
    private WorkspaceSearchService workspaceSearchService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        videoConferenceService = mock(VideoConferenceService.class);
        workspaceSearchService = new WorkspaceSearchService(authService, chatService, videoConferenceService);
    }

    @Test
    void searchCombinesAndFiltersWorkspaceEntities() {
        UUID activeChatId = UUID.randomUUID();
        UUID archivedChatId = UUID.randomUUID();
        UUID conferenceId = UUID.randomUUID();

        when(authService.searchUsers("north", "rem")).thenReturn(List.of(
                new UserProfileResponse(
                        UUID.randomUUID(),
                        "remote_user",
                        "Remote User",
                        Instant.parse("2026-05-03T00:00:00Z"),
                        null,
                        true
                )
        ));
        when(authService.listContacts("north")).thenReturn(List.of(
                new UserProfileResponse(
                        UUID.randomUUID(),
                        "friend_remote",
                        "Friend Remote",
                        Instant.parse("2026-05-03T00:00:00Z"),
                        null,
                        true
                ),
                new UserProfileResponse(
                        UUID.randomUUID(),
                        "north_local",
                        "North Local",
                        Instant.parse("2026-05-03T00:00:00Z"),
                        null,
                        true
                )
        ));
        when(chatService.listArchivedChatIds("north")).thenReturn(List.of(archivedChatId));
        when(chatService.listChats("north")).thenReturn(List.of(
                new ChatSummaryResponse(
                        activeChatId,
                        false,
                        "Remote Team",
                        null,
                        "chat-version-active",
                        new ChatCapabilitiesResponse(false, false, false, false, false, false, false, true),
                        null,
                        List.<UUID>of(),
                        List.of(new ParticipantResponse(UUID.randomUUID(), "remote_user", "Remote User", null, true)),
                        null,
                        Instant.parse("2026-05-03T00:00:00Z"),
                        false,
                        false,
                        null,
                        List.of(),
                        null,
                        Instant.parse("2026-05-03T00:00:00Z"),
                        0,
                        1L,
                        null,
                        List.of(),
                        "FULL_HISTORY"
                ),
                new ChatSummaryResponse(
                        archivedChatId,
                        false,
                        "Archived Remote",
                        null,
                        "chat-version-archived",
                        new ChatCapabilitiesResponse(false, false, false, false, false, false, false, true),
                        null,
                        List.<UUID>of(),
                        List.of(new ParticipantResponse(UUID.randomUUID(), "archived_user", "Archived User", null, true)),
                        null,
                        Instant.parse("2026-05-03T00:00:00Z"),
                        false,
                        false,
                        null,
                        List.of(),
                        null,
                        Instant.parse("2026-05-03T00:00:00Z"),
                        0,
                        1L,
                        null,
                        List.of(),
                        "FULL_HISTORY"
                )
        ));
        when(videoConferenceService.listConferences("north")).thenReturn(List.of(
                new VideoConferenceResponse(
                        conferenceId,
                        "Remote Planning",
                        null,
                        null,
                        Instant.parse("2026-05-03T10:00:00Z"),
                        Instant.parse("2026-05-03T00:00:00Z"),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        new ParticipantResponse(UUID.randomUUID(), "north", "North", null, true),
                        List.of(new ParticipantResponse(UUID.randomUUID(), "remote_user", "Remote User", null, true))
                )
        ));

        var response = workspaceSearchService.search("north", " rem ");

        assertThat(response.users()).hasSize(1);
        assertThat(response.contacts()).extracting(UserProfileResponse::username)
                .containsExactly("friend_remote");
        assertThat(response.chats()).extracting(ChatSummaryResponse::id)
                .containsExactly(activeChatId);
        assertThat(response.conferences()).extracting(VideoConferenceResponse::id)
                .containsExactly(conferenceId);
    }
}
