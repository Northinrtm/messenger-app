package com.north.messenger.application.chat;

import com.north.messenger.api.dto.AddConferenceParticipantsRequest;
import com.north.messenger.api.dto.CreateVideoConferenceRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateVideoConferenceRequest;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ConferenceRecording;
import com.north.messenger.domain.model.VideoConferenceAttendance;
import com.north.messenger.domain.repository.ConferenceRecordingRepository;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.VideoConference;
import com.north.messenger.domain.model.VideoConferenceParticipant;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.VideoConferenceAttendanceRepository;
import com.north.messenger.domain.repository.VideoConferenceParticipantRepository;
import com.north.messenger.domain.repository.VideoConferenceRepository;
import com.north.messenger.security.JwtProperties;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class VideoConferenceServiceTest {

    private static final String TEST_JWT_SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

    private AuthService authService;
    private ChatService chatService;
    private ChatParticipantRepository chatParticipantRepository;
    private UserAccountRepository userAccountRepository;
    private VideoConferenceRepository videoConferenceRepository;
    private VideoConferenceParticipantRepository videoConferenceParticipantRepository;
    private VideoConferenceAttendanceRepository videoConferenceAttendanceRepository;
    private ConferenceRecordingRepository conferenceRecordingRepository;
    private ConferenceRecordingStorage conferenceRecordingStorage;
    private ConferenceRecordingImportService conferenceRecordingImportService;
    private ClusterJobLockService clusterJobLockService;
    private VideoConferenceService videoConferenceService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        videoConferenceRepository = mock(VideoConferenceRepository.class);
        videoConferenceParticipantRepository = mock(VideoConferenceParticipantRepository.class);
        videoConferenceAttendanceRepository = mock(VideoConferenceAttendanceRepository.class);
        conferenceRecordingRepository = mock(ConferenceRecordingRepository.class);
        conferenceRecordingStorage = mock(ConferenceRecordingStorage.class);
        conferenceRecordingImportService = mock(ConferenceRecordingImportService.class);
        clusterJobLockService = mock(ClusterJobLockService.class);
        videoConferenceService = new VideoConferenceService(
                authService,
                chatService,
                chatParticipantRepository,
                userAccountRepository,
                videoConferenceRepository,
                videoConferenceParticipantRepository,
                videoConferenceAttendanceRepository,
                conferenceRecordingRepository,
                conferenceRecordingStorage,
                conferenceRecordingImportService,
                clusterJobLockService,
                new JwtProperties(
                        TEST_JWT_SECRET,
                        Duration.ofHours(12),
                        Duration.ofDays(30),
                        "north-messenger",
                        "north-messenger-clients",
                        false
                )
        );

        when(videoConferenceRepository.save(any(VideoConference.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(videoConferenceRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(videoConferenceAttendanceRepository.save(any(VideoConferenceAttendance.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(videoConferenceAttendanceRepository.findActiveUserIds(any(UUID.class), any(Instant.class))).thenReturn(List.of());
        when(conferenceRecordingRepository.findByConferenceId(any(UUID.class))).thenReturn(Optional.empty());
        when(conferenceRecordingRepository.findAllByConferenceIdIn(anyCollection())).thenReturn(List.of());
        when(conferenceRecordingImportService.discoverAvailableRecordings()).thenReturn(List.of());
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(any(UUID.class))).thenReturn(List.of());
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(any(UUID.class))).thenReturn(List.of());
        when(chatParticipantRepository.findAllByChatIdInOrderByJoinedAtAsc(anyCollection())).thenReturn(List.of());
        when(chatParticipantRepository.existsByChatIdAndUserId(any(UUID.class), any(UUID.class))).thenReturn(false);
        when(clusterJobLockService.runIfLockAcquired(anyLong(), any(Runnable.class))).thenAnswer(invocation -> {
            Runnable task = invocation.getArgument(1);
            task.run();
            return true;
        });
    }

    @Test
    void createConferenceShouldSupportEmptyParticipantList() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        ParticipantResponse currentUserResponse = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        List<VideoConferenceParticipant> savedMemberships = new ArrayList<>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(currentUser.getId(), true));
        when(authService.toParticipant(currentUser, true)).thenReturn(currentUserResponse);
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class))).thenAnswer(invocation -> {
            VideoConferenceParticipant membership = invocation.getArgument(0);
            savedMemberships.add(membership);
            return membership;
        });
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(any(UUID.class)))
                .thenAnswer(invocation -> List.copyOf(savedMemberships));

        var response = videoConferenceService.createConference(
                "north",
                new CreateVideoConferenceRequest(
                        "Team sync",
                        Instant.now().plusSeconds(300),
                        List.of()
                )
        );

        assertThat(response.title()).isEqualTo("Team sync");
        assertThat(response.createdBy().id()).isEqualTo(currentUser.getId());
        assertThat(response.roomName())
                .startsWith("vc-")
                .hasSizeGreaterThanOrEqualTo(25)
                .doesNotContain("+", "/", "=");
        assertThat(response.roomAccessCode()).isNotBlank();
        assertThat(response.activatedAt()).isNotNull();
        assertThat(response.participants()).containsExactly(currentUserResponse);
        verify(videoConferenceRepository).save(any(VideoConference.class));
        verify(videoConferenceParticipantRepository).save(any(VideoConferenceParticipant.class));
    }

    @Test
    void startGroupConferenceCallShouldCreateChatBoundConferenceForCurrentMembers() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount teammate = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Study Group", false, Instant.parse("2026-03-25T11:30:00Z"));
        List<ChatParticipant> chatMemberships = List.of(
                new ChatParticipant(UUID.randomUUID(), chatId, organizer.getId(), Instant.parse("2026-03-25T11:30:00Z")),
                new ChatParticipant(UUID.randomUUID(), chatId, teammate.getId(), Instant.parse("2026-03-25T11:31:00Z"))
        );
        List<VideoConferenceParticipant> savedMemberships = new ArrayList<>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(chatService.requireChatMembership(chatId, organizer)).thenReturn(room);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(chatMemberships);
        when(videoConferenceRepository.findAllByChatIdAndEndedAtIsNullOrderByScheduledAtAscCreatedAtAsc(chatId))
                .thenReturn(List.of());
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class))).thenAnswer(invocation -> {
            VideoConferenceParticipant membership = invocation.getArgument(0);
            savedMemberships.add(membership);
            return membership;
        });
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(any(UUID.class)))
                .thenAnswer(invocation -> List.copyOf(savedMemberships));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer, teammate));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(
                organizer.getId(), true,
                teammate.getId(), true
        ));
        when(authService.toParticipant(organizer, true)).thenReturn(new ParticipantResponse(
                organizer.getId(), organizer.getUsername(), organizer.getDisplayName(), organizer.getAvatarUrl(), true
        ));
        when(authService.toParticipant(teammate, true)).thenReturn(new ParticipantResponse(
                teammate.getId(), teammate.getUsername(), teammate.getDisplayName(), teammate.getAvatarUrl(), true
        ));

        VideoConferenceResponse response = videoConferenceService.startGroupConferenceCall("north", chatId);

        ArgumentCaptor<VideoConference> savedConference = ArgumentCaptor.forClass(VideoConference.class);
        verify(videoConferenceRepository).save(savedConference.capture());
        assertThat(savedConference.getValue().getChatId()).isEqualTo(chatId);
        assertThat(response.chatId()).isEqualTo(chatId);
        assertThat(response.participants())
                .extracting(ParticipantResponse::username)
                .containsExactly("north", "south");
        verify(videoConferenceParticipantRepository, times(2)).save(any(VideoConferenceParticipant.class));
    }

    @Test
    void endConferenceShouldMarkConferenceAsEndedForOrganizer() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );
        VideoConferenceParticipant membership = new VideoConferenceParticipant(
                UUID.randomUUID(),
                conference.getId(),
                organizer.getId(),
                Instant.parse("2026-03-25T11:55:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(java.util.Optional.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId()))
                .thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(organizer.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);

        VideoConferenceResponse response = videoConferenceService.endConference("north", conference.getId());

        assertThat(conference.isEnded()).isTrue();
        assertThat(conference.getEndedAt()).isNotNull();
        assertThat(response.endedAt()).isEqualTo(conference.getEndedAt());
    }

    @Test
    void endConferenceShouldRejectNonOrganizer() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount participant = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );

        when(authService.requireAuthenticatedUser("south")).thenReturn(participant);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(java.util.Optional.of(conference));

        assertThatThrownBy(() -> videoConferenceService.endConference("south", conference.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only the organizer can end the conference");
        assertThat(conference.isEnded()).isFalse();
    }

    @Test
    void updateConferenceShouldRenameAndReschedulePlannedConference() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        Instant updatedScheduledAt = Instant.now().plusSeconds(7_200);
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Initial title",
                "vc-room",
                organizer.getId(),
                Instant.now().plusSeconds(90),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );
        VideoConferenceParticipant membership = new VideoConferenceParticipant(
                UUID.randomUUID(),
                conference.getId(),
                organizer.getId(),
                Instant.parse("2026-03-25T11:55:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId()))
                .thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(organizer.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);

        VideoConferenceResponse response = videoConferenceService.updateConference(
                "north",
                conference.getId(),
                new UpdateVideoConferenceRequest("Updated title", updatedScheduledAt)
        );

        assertThat(response.title()).isEqualTo("Updated title");
        assertThat(response.scheduledAt()).isEqualTo(updatedScheduledAt);
        assertThat(response.roomName()).isNull();
        assertThat(response.activatedAt()).isNull();
    }

    @Test
    void cancelConferenceShouldDeletePlannedConferenceForOrganizer() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                null,
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null,
                null
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));

        videoConferenceService.cancelConference("north", conference.getId());

        verify(videoConferenceRepository).delete(conference);
    }

    @Test
    void cancelConferenceShouldRejectStartedConference() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));

        assertThatThrownBy(() -> videoConferenceService.cancelConference("north", conference.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Started conference can no longer be cancelled");
        verify(videoConferenceRepository, never()).delete(any(VideoConference.class));
    }

    @Test
    void touchConferencePresenceShouldTrackActiveSession() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.now().plusSeconds(90),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));
        when(videoConferenceParticipantRepository.existsByConferenceIdAndUserId(conference.getId(), organizer.getId()))
                .thenReturn(true);
        when(videoConferenceAttendanceRepository.findByConferenceIdAndSessionId(conference.getId(), sessionId))
                .thenReturn(Optional.empty());

        videoConferenceService.touchConferencePresence("north", sessionId, conference.getId());

        verify(videoConferenceAttendanceRepository).save(any(VideoConferenceAttendance.class));
    }

    @Test
    void clearConferencePresenceShouldMarkSessionAsLeft() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID sessionId = UUID.randomUUID();
        VideoConferenceAttendance attendance = new VideoConferenceAttendance(
                UUID.randomUUID(),
                UUID.randomUUID(),
                organizer.getId(),
                sessionId,
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:57:00Z"),
                null
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceAttendanceRepository.findByConferenceIdAndSessionId(attendance.getConferenceId(), sessionId))
                .thenReturn(Optional.of(attendance));

        videoConferenceService.clearConferencePresence("north", sessionId, attendance.getConferenceId());

        assertThat(attendance.getLeftAt()).isNotNull();
    }

    @Test
    void activateScheduledConferencesShouldEndStartedConferenceWithoutParticipantsForTenMinutes() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.now().minusSeconds(900),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.now().minusSeconds(900)
        );

        when(videoConferenceRepository.findAllByEndedAtIsNullAndRoomNameIsNullAndScheduledAtLessThanEqual(any(Instant.class)))
                .thenReturn(List.of());
        when(videoConferenceRepository.findAllByEndedAtIsNullAndStartedAtIsNullAndScheduledAtLessThanEqual(any(Instant.class)))
                .thenReturn(List.of());
        when(videoConferenceRepository.findAllByEndedAtIsNullAndStartedAtIsNotNull()).thenReturn(List.of(conference));
        when(videoConferenceAttendanceRepository.countActiveSessions(any(UUID.class), any(Instant.class))).thenReturn(0L);
        when(videoConferenceAttendanceRepository.findLatestSeenAt(conference.getId())).thenReturn(null);

        videoConferenceService.activateScheduledConferences();

        assertThat(conference.getEndedAt()).isNotNull();
        verify(videoConferenceRepository).saveAll(anyCollection());
    }

    @Test
    void listConferencesShouldSkipEndedConferences() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        ParticipantResponse currentUserResponse = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        VideoConference activeConference = new VideoConference(
                UUID.randomUUID(),
                "Active",
                "vc-active",
                currentUser.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );
        VideoConference endedConference = new VideoConference(
                UUID.randomUUID(),
                "Ended",
                "vc-ended",
                currentUser.getId(),
                Instant.parse("2026-03-25T13:00:00Z"),
                Instant.parse("2026-03-25T12:55:00Z"),
                Instant.parse("2026-03-25T12:55:00Z"),
                Instant.parse("2026-03-25T12:56:00Z")
        );
        endedConference.end(Instant.parse("2026-03-25T13:15:00Z"));

        List<VideoConferenceParticipant> memberships = List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), activeConference.getId(), currentUser.getId(), Instant.now()),
                new VideoConferenceParticipant(UUID.randomUUID(), endedConference.getId(), currentUser.getId(), Instant.now())
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(currentUser.getId()))
                .thenReturn(memberships);
        when(videoConferenceRepository.findAllByIdIn(anyCollection()))
                .thenReturn(List.of(activeConference, endedConference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(anyCollection()))
                .thenReturn(memberships);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(currentUser.getId(), true));
        when(authService.toParticipant(currentUser, true)).thenReturn(currentUserResponse);

        List<VideoConferenceResponse> response = videoConferenceService.listConferences("north");

        assertThat(response).extracting(VideoConferenceResponse::id).containsExactly(activeConference.getId());
    }

    @Test
    void listArchivedConferencesShouldReturnEndedConferencesOrderedByEndedAtDesc() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        ParticipantResponse currentUserResponse = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        VideoConference earlierEndedConference = new VideoConference(
                UUID.randomUUID(),
                "Earlier ended",
                "vc-earlier",
                currentUser.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );
        earlierEndedConference.end(Instant.parse("2026-03-25T12:30:00Z"));

        VideoConference laterEndedConference = new VideoConference(
                UUID.randomUUID(),
                "Later ended",
                "vc-later",
                currentUser.getId(),
                Instant.parse("2026-03-25T13:00:00Z"),
                Instant.parse("2026-03-25T12:55:00Z"),
                Instant.parse("2026-03-25T12:55:00Z"),
                Instant.parse("2026-03-25T12:56:00Z")
        );
        laterEndedConference.end(Instant.parse("2026-03-25T13:30:00Z"));

        List<VideoConferenceParticipant> memberships = List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), earlierEndedConference.getId(), currentUser.getId(), Instant.now()),
                new VideoConferenceParticipant(UUID.randomUUID(), laterEndedConference.getId(), currentUser.getId(), Instant.now())
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(currentUser.getId()))
                .thenReturn(memberships);
        when(videoConferenceRepository.findAllByIdIn(anyCollection()))
                .thenReturn(List.of(earlierEndedConference, laterEndedConference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(anyCollection()))
                .thenReturn(memberships);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(currentUser.getId(), true));
        when(authService.toParticipant(currentUser, true)).thenReturn(currentUserResponse);

        List<VideoConferenceResponse> response = videoConferenceService.listArchivedConferences("north");

        assertThat(response)
                .extracting(VideoConferenceResponse::id)
                .containsExactly(laterEndedConference.getId(), earlierEndedConference.getId());
        assertThat(response)
                .extracting(VideoConferenceResponse::endedAt)
                .containsExactly(
                        Instant.parse("2026-03-25T13:30:00Z"),
                        Instant.parse("2026-03-25T12:30:00Z")
                );
    }

    @Test
    void createConferenceShouldDelayRoomCreationUntilActivationWindow() {
        UserAccount currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        ParticipantResponse currentUserResponse = new ParticipantResponse(
                currentUser.getId(),
                currentUser.getUsername(),
                currentUser.getDisplayName(),
                currentUser.getAvatarUrl(),
                true
        );
        List<VideoConferenceParticipant> savedMemberships = new ArrayList<>();

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(currentUser));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(currentUser.getId(), true));
        when(authService.toParticipant(currentUser, true)).thenReturn(currentUserResponse);
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class))).thenAnswer(invocation -> {
            VideoConferenceParticipant membership = invocation.getArgument(0);
            savedMemberships.add(membership);
            return membership;
        });
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(any(UUID.class)))
                .thenAnswer(invocation -> List.copyOf(savedMemberships));

        VideoConferenceResponse response = videoConferenceService.createConference(
                "north",
                new CreateVideoConferenceRequest(
                        "Far future sync",
                        Instant.now().plusSeconds(3_600),
                        List.of()
                )
        );

        assertThat(response.roomName()).isNull();
        assertThat(response.activatedAt()).isNull();
    }

    @Test
    void listConferencesShouldRevealRoomFiveMinutesBeforeScheduledStart() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount participant = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Planned",
                "vc-hidden",
                organizer.getId(),
                Instant.now().plusSeconds(120),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null
        );
        List<VideoConferenceParticipant> memberships = List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), organizer.getId(), Instant.now()),
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), participant.getId(), Instant.now())
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );
        ParticipantResponse participantResponse = new ParticipantResponse(
                participant.getId(),
                participant.getUsername(),
                participant.getDisplayName(),
                participant.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("south")).thenReturn(participant);
        when(videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(participant.getId()))
                .thenReturn(List.of(memberships.get(1)));
        when(videoConferenceRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(anyCollection()))
                .thenReturn(memberships);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer, participant));
        when(authService.resolveOnlineByUserIds(anyCollection()))
                .thenReturn(Map.of(organizer.getId(), true, participant.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);
        when(authService.toParticipant(participant, true)).thenReturn(participantResponse);

        List<VideoConferenceResponse> response = videoConferenceService.listConferences("south");

        assertThat(response).hasSize(1);
        assertThat(response.get(0).roomName()).isEqualTo("vc-hidden");
        assertThat(response.get(0).roomAccessCode()).isNotBlank();
        assertThat(response.get(0).startedAt()).isNull();
    }

    @Test
    void listConferencesShouldNotStartDueConferenceFromReadPath() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount participant = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Auto started",
                "vc-visible",
                organizer.getId(),
                Instant.now().minusSeconds(120),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null
        );
        List<VideoConferenceParticipant> memberships = List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), organizer.getId(), Instant.now()),
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), participant.getId(), Instant.now())
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );
        ParticipantResponse participantResponse = new ParticipantResponse(
                participant.getId(),
                participant.getUsername(),
                participant.getDisplayName(),
                participant.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("south")).thenReturn(participant);
        when(videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(participant.getId()))
                .thenReturn(List.of(memberships.get(1)));
        when(videoConferenceRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(anyCollection()))
                .thenReturn(memberships);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer, participant));
        when(authService.resolveOnlineByUserIds(anyCollection()))
                .thenReturn(Map.of(organizer.getId(), true, participant.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);
        when(authService.toParticipant(participant, true)).thenReturn(participantResponse);

        List<VideoConferenceResponse> response = videoConferenceService.listConferences("south");

        assertThat(response).hasSize(1);
        assertThat(response.get(0).roomName()).isEqualTo("vc-visible");
        assertThat(response.get(0).roomAccessCode()).isNotBlank();
        assertThat(response.get(0).startedAt()).isNull();
        verify(videoConferenceRepository, never()).saveAll(any());
    }

    @Test
    void startConferenceShouldMarkConferenceAsStartedForOrganizer() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null
        );
        VideoConferenceParticipant membership = new VideoConferenceParticipant(
                UUID.randomUUID(),
                conference.getId(),
                organizer.getId(),
                Instant.parse("2026-03-25T11:55:00Z")
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(java.util.Optional.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId()))
                .thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(organizer.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);

        VideoConferenceResponse response = videoConferenceService.startConference("north", conference.getId());

        assertThat(conference.getStartedAt()).isNotNull();
        assertThat(response.startedAt()).isEqualTo(conference.getStartedAt());
        assertThat(response.roomName()).isEqualTo("vc-room");
    }

    @Test
    void addParticipantsShouldAppendOnlyNewUsers() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount existingParticipant = testUserAccount(
                UUID.randomUUID(),
                "south",
                "South",
                "password-hash",
                Instant.parse("2026-03-20T12:10:00Z")
        );
        UserAccount invitedParticipant = testUserAccount(
                UUID.randomUUID(),
                "east",
                "East",
                "password-hash",
                Instant.parse("2026-03-20T12:15:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                "vc-room",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );
        List<VideoConferenceParticipant> memberships = new ArrayList<>(List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), organizer.getId(), Instant.parse("2026-03-25T11:55:00Z")),
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), existingParticipant.getId(), Instant.parse("2026-03-25T11:55:00Z"))
        ));

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(java.util.Optional.of(conference));
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId()))
                .thenAnswer(invocation -> List.copyOf(memberships));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Iterable<UUID> ids = invocation.getArgument(0);
            List<UserAccount> users = new ArrayList<>();
            for (UUID id : ids) {
                if (id.equals(organizer.getId())) {
                    users.add(organizer);
                } else if (id.equals(existingParticipant.getId())) {
                    users.add(existingParticipant);
                } else if (id.equals(invitedParticipant.getId())) {
                    users.add(invitedParticipant);
                }
            }
            return users;
        });
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(
                organizer.getId(), true,
                existingParticipant.getId(), true,
                invitedParticipant.getId(), false
        ));
        when(authService.toParticipant(organizer, true)).thenReturn(new ParticipantResponse(
                organizer.getId(), organizer.getUsername(), organizer.getDisplayName(), organizer.getAvatarUrl(), true
        ));
        when(authService.toParticipant(existingParticipant, true)).thenReturn(new ParticipantResponse(
                existingParticipant.getId(),
                existingParticipant.getUsername(),
                existingParticipant.getDisplayName(),
                existingParticipant.getAvatarUrl(),
                true
        ));
        when(authService.toParticipant(invitedParticipant, false)).thenReturn(new ParticipantResponse(
                invitedParticipant.getId(),
                invitedParticipant.getUsername(),
                invitedParticipant.getDisplayName(),
                invitedParticipant.getAvatarUrl(),
                false
        ));
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class))).thenAnswer(invocation -> {
            VideoConferenceParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(authService.requireExistingUser("east")).thenReturn(invitedParticipant);

        VideoConferenceResponse response = videoConferenceService.addParticipants(
                "north",
                conference.getId(),
                new AddConferenceParticipantsRequest(List.of("south", "east"))
        );

        assertThat(response.participants()).hasSize(3);
        assertThat(response.participants())
                .extracting(ParticipantResponse::username)
                .containsExactly("north", "south", "east");
    }

    @Test
    void joinConferenceViaInviteShouldAppendInvitedUser() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount invitedUser = testUserAccount(
                UUID.randomUUID(),
                "guest",
                "Guest",
                "password-hash",
                Instant.parse("2026-03-20T12:15:00Z")
        );
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Team sync",
                null,
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                null,
                null
        );
        List<VideoConferenceParticipant> memberships = new ArrayList<>(List.of(
                new VideoConferenceParticipant(UUID.randomUUID(), conference.getId(), organizer.getId(), Instant.parse("2026-03-25T11:55:00Z"))
        ));

        when(authService.requireAuthenticatedUser("guest")).thenReturn(invitedUser);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));
        when(videoConferenceParticipantRepository.existsByConferenceIdAndUserId(conference.getId(), invitedUser.getId()))
                .thenReturn(false);
        when(videoConferenceParticipantRepository.save(any(VideoConferenceParticipant.class))).thenAnswer(invocation -> {
            VideoConferenceParticipant membership = invocation.getArgument(0);
            memberships.add(membership);
            return membership;
        });
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId()))
                .thenAnswer(invocation -> List.copyOf(memberships));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer, invitedUser));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(
                organizer.getId(), true,
                invitedUser.getId(), true
        ));
        when(authService.toParticipant(organizer, true)).thenReturn(new ParticipantResponse(
                organizer.getId(), organizer.getUsername(), organizer.getDisplayName(), organizer.getAvatarUrl(), true
        ));
        when(authService.toParticipant(invitedUser, true)).thenReturn(new ParticipantResponse(
                invitedUser.getId(), invitedUser.getUsername(), invitedUser.getDisplayName(), invitedUser.getAvatarUrl(), true
        ));

        VideoConferenceResponse response = videoConferenceService.joinConferenceViaInvite("guest", conference.getId());

        assertThat(response.participants()).extracting(ParticipantResponse::username)
                .containsExactly("north", "guest");
    }

    @Test
    void joinConferenceViaInviteShouldResolveParticipantsFromGroupMembershipForChatBoundConference() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UserAccount member = testUserAccount(
                UUID.randomUUID(),
                "guest",
                "Guest",
                "password-hash",
                Instant.parse("2026-03-20T12:15:00Z")
        );
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "Study Group", false, Instant.parse("2026-03-25T11:30:00Z"));
        VideoConference conference = new VideoConference(
                UUID.randomUUID(),
                "Group call",
                "vc-group",
                organizer.getId(),
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z"),
                chatId
        );
        List<ChatParticipant> chatMemberships = List.of(
                new ChatParticipant(UUID.randomUUID(), chatId, organizer.getId(), Instant.parse("2026-03-25T11:30:00Z")),
                new ChatParticipant(UUID.randomUUID(), chatId, member.getId(), Instant.parse("2026-03-25T11:31:00Z"))
        );

        when(authService.requireAuthenticatedUser("guest")).thenReturn(member);
        when(videoConferenceRepository.findById(conference.getId())).thenReturn(Optional.of(conference));
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(chatMemberships);
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer, member));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(
                organizer.getId(), true,
                member.getId(), true
        ));
        when(authService.toParticipant(organizer, true)).thenReturn(new ParticipantResponse(
                organizer.getId(), organizer.getUsername(), organizer.getDisplayName(), organizer.getAvatarUrl(), true
        ));
        when(authService.toParticipant(member, true)).thenReturn(new ParticipantResponse(
                member.getId(), member.getUsername(), member.getDisplayName(), member.getAvatarUrl(), true
        ));

        VideoConferenceResponse response = videoConferenceService.joinConferenceViaInvite("guest", conference.getId());

        assertThat(response.chatId()).isEqualTo(chatId);
        assertThat(response.participants()).extracting(ParticipantResponse::username)
                .containsExactly("north", "guest");
        verify(videoConferenceParticipantRepository, never()).save(any(VideoConferenceParticipant.class));
    }

    @Test
    void uploadRecordingShouldDeletePreviousStoredFileOnlyAfterCommit() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID conferenceId = UUID.randomUUID();
        VideoConference conference = endedConference(conferenceId, organizer.getId());
        ConferenceRecording existingRecording = new ConferenceRecording(
                conferenceId,
                "old-recording.mp4",
                "video/mp4",
                42L,
                Instant.parse("2026-03-25T12:30:00Z"),
                organizer.getId()
        );
        MockMultipartFile file = new MockMultipartFile("file", "recording.mp4", "video/mp4", new byte[] {1, 2, 3});
        VideoConferenceParticipant membership = new VideoConferenceParticipant(
                UUID.randomUUID(),
                conferenceId,
                organizer.getId(),
                Instant.parse("2026-03-25T11:55:00Z")
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conferenceId)).thenReturn(Optional.of(conference));
        when(conferenceRecordingRepository.findByConferenceId(conferenceId)).thenReturn(Optional.of(existingRecording));
        when(conferenceRecordingStorage.store(conferenceId, file)).thenReturn(
                new ConferenceRecordingStorage.StoredConferenceRecordingFile("new-recording.mp4", Path.of("new-recording.mp4"))
        );
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId))
                .thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(organizer.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);

        TransactionSynchronizationManager.initSynchronization();
        try {
            videoConferenceService.uploadRecording("north", conferenceId, file);

            verify(conferenceRecordingStorage, never()).deleteQuietly("old-recording.mp4");

            triggerAfterCommit();

            verify(conferenceRecordingStorage).deleteQuietly("old-recording.mp4");
            verify(conferenceRecordingStorage, never()).deleteQuietly("new-recording.mp4");
        } finally {
            clearSynchronization();
        }
    }

    @Test
    void uploadRecordingShouldDeleteNewStoredFileOnRollback() {
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        UUID conferenceId = UUID.randomUUID();
        VideoConference conference = endedConference(conferenceId, organizer.getId());
        MockMultipartFile file = new MockMultipartFile("file", "recording.mp4", "video/mp4", new byte[] {1, 2, 3});
        VideoConferenceParticipant membership = new VideoConferenceParticipant(
                UUID.randomUUID(),
                conferenceId,
                organizer.getId(),
                Instant.parse("2026-03-25T11:55:00Z")
        );
        ParticipantResponse organizerResponse = new ParticipantResponse(
                organizer.getId(),
                organizer.getUsername(),
                organizer.getDisplayName(),
                organizer.getAvatarUrl(),
                true
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(organizer);
        when(videoConferenceRepository.findById(conferenceId)).thenReturn(Optional.of(conference));
        when(conferenceRecordingStorage.store(conferenceId, file)).thenReturn(
                new ConferenceRecordingStorage.StoredConferenceRecordingFile("rollback-recording.mp4", Path.of("rollback-recording.mp4"))
        );
        when(videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId))
                .thenReturn(List.of(membership));
        when(userAccountRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(organizer));
        when(authService.resolveOnlineByUserIds(anyCollection())).thenReturn(Map.of(organizer.getId(), true));
        when(authService.toParticipant(organizer, true)).thenReturn(organizerResponse);

        TransactionSynchronizationManager.initSynchronization();
        try {
            videoConferenceService.uploadRecording("north", conferenceId, file);

            verify(conferenceRecordingStorage, never()).deleteQuietly("rollback-recording.mp4");

            triggerAfterRollback();

            verify(conferenceRecordingStorage).deleteQuietly("rollback-recording.mp4");
        } finally {
            clearSynchronization();
        }
    }

    @Test
    void synchronizeImportedRecordingsShouldDeleteSourceOnlyAfterCommit() {
        UUID conferenceId = UUID.randomUUID();
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = endedConference(conferenceId, organizer.getId());
        ConferenceRecordingImportService.ImportedConferenceRecordingCandidate importedRecording =
                new ConferenceRecordingImportService.ImportedConferenceRecordingCandidate(
                        Path.of("import/job-1"),
                        Path.of("import/job-1/recording.mp4"),
                        null,
                        conferenceId,
                        "video/mp4",
                        1_024L,
                        Instant.parse("2026-03-25T12:30:00Z")
                );

        when(conferenceRecordingImportService.discoverAvailableRecordings()).thenReturn(List.of(importedRecording));
        when(videoConferenceRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(conference));
        when(conferenceRecordingStorage.importStoredFile(conferenceId, importedRecording.videoFile(), importedRecording.mimeType()))
                .thenReturn(new ConferenceRecordingStorage.StoredConferenceRecordingFile("imported-recording.mp4", Path.of("imported-recording.mp4")));

        TransactionSynchronizationManager.initSynchronization();
        try {
            videoConferenceService.synchronizeImportedRecordings();

            verify(conferenceRecordingImportService, never()).deleteImportedRecordingQuietly(importedRecording.sourceDirectory());

            triggerAfterCommit();

            verify(conferenceRecordingImportService).deleteImportedRecordingQuietly(importedRecording.sourceDirectory());
            verify(conferenceRecordingStorage, never()).deleteQuietly("imported-recording.mp4");
        } finally {
            clearSynchronization();
        }
    }

    @Test
    void synchronizeImportedRecordingsShouldDeleteStoredFileOnRollback() {
        UUID conferenceId = UUID.randomUUID();
        UserAccount organizer = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        VideoConference conference = endedConference(conferenceId, organizer.getId());
        ConferenceRecordingImportService.ImportedConferenceRecordingCandidate importedRecording =
                new ConferenceRecordingImportService.ImportedConferenceRecordingCandidate(
                        Path.of("import/job-2"),
                        Path.of("import/job-2/recording.mp4"),
                        null,
                        conferenceId,
                        "video/mp4",
                        1_024L,
                        Instant.parse("2026-03-25T12:31:00Z")
                );

        when(conferenceRecordingImportService.discoverAvailableRecordings()).thenReturn(List.of(importedRecording));
        when(videoConferenceRepository.findAllByIdIn(anyCollection())).thenReturn(List.of(conference));
        when(conferenceRecordingStorage.importStoredFile(conferenceId, importedRecording.videoFile(), importedRecording.mimeType()))
                .thenReturn(new ConferenceRecordingStorage.StoredConferenceRecordingFile("imported-rollback.mp4", Path.of("imported-rollback.mp4")));

        TransactionSynchronizationManager.initSynchronization();
        try {
            videoConferenceService.synchronizeImportedRecordings();

            verify(conferenceRecordingStorage, never()).deleteQuietly("imported-rollback.mp4");

            triggerAfterRollback();

            verify(conferenceRecordingStorage).deleteQuietly("imported-rollback.mp4");
            verify(conferenceRecordingImportService, never()).deleteImportedRecordingQuietly(importedRecording.sourceDirectory());
        } finally {
            clearSynchronization();
        }
    }

    private VideoConference endedConference(UUID conferenceId, UUID organizerId) {
        VideoConference conference = new VideoConference(
                conferenceId,
                "Team sync",
                "vc-room",
                organizerId,
                Instant.parse("2026-03-25T12:00:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:55:00Z"),
                Instant.parse("2026-03-25T11:56:00Z")
        );
        conference.end(Instant.parse("2026-03-25T12:40:00Z"));
        return conference;
    }

    private void triggerAfterCommit() {
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
    }

    private void triggerAfterRollback() {
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
    }

    private void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
