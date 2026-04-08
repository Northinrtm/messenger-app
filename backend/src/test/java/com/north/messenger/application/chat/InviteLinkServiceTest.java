package com.north.messenger.application.chat;

import com.north.messenger.api.dto.InviteAcceptanceResponse;
import com.north.messenger.api.dto.InviteLinkResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.InviteLink;
import com.north.messenger.domain.model.InviteLinkTargetType;
import com.north.messenger.domain.repository.InviteLinkRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InviteLinkServiceTest {

    private InviteLinkRepository inviteLinkRepository;
    private ChatService chatService;
    private VideoConferenceService videoConferenceService;
    private InviteLinkService inviteLinkService;

    @BeforeEach
    void setUp() {
        inviteLinkRepository = mock(InviteLinkRepository.class);
        chatService = mock(ChatService.class);
        videoConferenceService = mock(VideoConferenceService.class);
        inviteLinkService = new InviteLinkService(inviteLinkRepository, chatService, videoConferenceService);
        when(inviteLinkRepository.save(any(InviteLink.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void createGroupInviteLinkShouldReuseExistingCode() {
        UUID chatId = UUID.randomUUID();
        InviteLink inviteLink = new InviteLink(
                UUID.randomUUID(),
                "Abc123xyZ9LmN0pQ",
                InviteLinkTargetType.GROUP,
                chatId,
                Instant.parse("2026-04-08T10:00:00Z")
        );

        when(chatService.requireChatMembership(chatId, "north"))
                .thenReturn(new ChatRoom(chatId, "Project", false, Instant.now()));
        when(inviteLinkRepository.findByTargetTypeAndTargetId(InviteLinkTargetType.GROUP, chatId))
                .thenReturn(Optional.of(inviteLink));

        InviteLinkResponse response = inviteLinkService.createGroupInviteLink("north", chatId, false);

        assertThat(response.code()).isEqualTo("+Abc123xyZ9LmN0pQ");
        verify(inviteLinkRepository, never()).save(any(InviteLink.class));
    }

    @Test
    void createGroupInviteLinkShouldRotateLegacyCodeEvenWithoutRefresh() {
        UUID chatId = UUID.randomUUID();
        InviteLink inviteLink = new InviteLink(
                UUID.randomUUID(),
                "abc123xy",
                InviteLinkTargetType.GROUP,
                chatId,
                Instant.parse("2026-04-08T10:00:00Z")
        );

        when(chatService.requireChatMembership(chatId, "north"))
                .thenReturn(new ChatRoom(chatId, "Project", false, Instant.now()));
        when(inviteLinkRepository.findByTargetTypeAndTargetId(InviteLinkTargetType.GROUP, chatId))
                .thenReturn(Optional.of(inviteLink));

        InviteLinkResponse response = inviteLinkService.createGroupInviteLink("north", chatId, false);

        assertThat(response.code()).startsWith("+").hasSize(17).isNotEqualTo("+abc123xy");
        assertThat(inviteLink.getCode()).isEqualTo(response.code().substring(1));
        verify(inviteLinkRepository).save(inviteLink);
    }

    @Test
    void createGroupInviteLinkShouldRefreshExistingCode() {
        UUID chatId = UUID.randomUUID();
        InviteLink inviteLink = new InviteLink(
                UUID.randomUUID(),
                "Abc123xyZ9LmN0pQ",
                InviteLinkTargetType.GROUP,
                chatId,
                Instant.parse("2026-04-08T10:00:00Z")
        );

        when(chatService.requireChatMembership(chatId, "north"))
                .thenReturn(new ChatRoom(chatId, "Project", false, Instant.now()));
        when(inviteLinkRepository.findByTargetTypeAndTargetId(InviteLinkTargetType.GROUP, chatId))
                .thenReturn(Optional.of(inviteLink));

        InviteLinkResponse response = inviteLinkService.createGroupInviteLink("north", chatId, true);

        assertThat(response.code()).startsWith("+").hasSize(17).isNotEqualTo("+Abc123xyZ9LmN0pQ");
        assertThat(inviteLink.getCode()).isEqualTo(response.code().substring(1));
        verify(inviteLinkRepository).save(inviteLink);
    }

    @Test
    void acceptInviteShouldJoinConferenceTargetUsingTelegramStyleCode() {
        UUID conferenceId = UUID.randomUUID();
        String inviteCode = "p1TPmf2QEVjOTYyX";
        InviteLink inviteLink = new InviteLink(
                UUID.randomUUID(),
                inviteCode,
                InviteLinkTargetType.CONFERENCE,
                conferenceId,
                Instant.parse("2026-04-08T10:00:00Z")
        );
        ParticipantResponse organizer = new ParticipantResponse(
                UUID.randomUUID(),
                "north",
                "North",
                null,
                true
        );
        VideoConferenceResponse conference = new VideoConferenceResponse(
                conferenceId,
                "Sync",
                null,
                null,
                Instant.parse("2026-04-08T12:00:00Z"),
                Instant.parse("2026-04-08T11:50:00Z"),
                null,
                null,
                null,
                null,
                null,
                null,
                organizer,
                List.of(organizer)
        );

        when(inviteLinkRepository.findByCode(inviteCode)).thenReturn(Optional.of(inviteLink));
        when(videoConferenceService.joinConferenceViaInvite("north", conferenceId)).thenReturn(conference);

        InviteAcceptanceResponse response = inviteLinkService.acceptInvite("north", "+" + inviteCode);

        assertThat(response.targetType()).isEqualTo("CONFERENCE");
        assertThat(response.conference()).isEqualTo(conference);
        assertThat(response.chat()).isNull();
    }

    @Test
    void acceptInviteShouldRejectLegacyInviteCodesWithoutPublicPrefix() {
        UUID conferenceId = UUID.randomUUID();
        InviteLink inviteLink = new InviteLink(
                UUID.randomUUID(),
                "meet42ab",
                InviteLinkTargetType.CONFERENCE,
                conferenceId,
                Instant.parse("2026-04-08T10:00:00Z")
        );
        ParticipantResponse organizer = new ParticipantResponse(
                UUID.randomUUID(),
                "north",
                "North",
                null,
                true
        );
        VideoConferenceResponse conference = new VideoConferenceResponse(
                conferenceId,
                "Sync",
                null,
                null,
                Instant.parse("2026-04-08T12:00:00Z"),
                Instant.parse("2026-04-08T11:50:00Z"),
                null,
                null,
                null,
                null,
                null,
                null,
                organizer,
                List.of(organizer)
        );

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                inviteLinkService.acceptInvite("north", "MEET42AB")
        )
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("Invite code format is invalid");
    }
}
