package com.north.messenger.application.message;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ChatAttachmentServiceTest {

    @Test
    void cleanupOrphanedAttachmentsDeletesExpiredUnlinkedUploads() {
        ChatAttachmentRepository chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        ChatAttachmentStorage chatAttachmentStorage = mock(ChatAttachmentStorage.class);
        Instant now = Instant.parse("2026-04-21T10:00:00Z");
        ChatAttachment expiredAttachment = new ChatAttachment(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "expired.bin",
                "expired.bin",
                "application/octet-stream",
                128L,
                now.minus(Duration.ofHours(2))
        );
        when(chatAttachmentRepository.findAllByMessageIdIsNullAndCreatedAtBefore(now.minus(Duration.ofHours(1))))
                .thenReturn(List.of(expiredAttachment));

        ChatAttachmentService service = chatAttachmentService(
                chatAttachmentRepository,
                chatAttachmentStorage,
                Duration.ofHours(1)
        );

        int deletedCount = service.cleanupOrphanedAttachments(now);

        assertThat(deletedCount).isEqualTo(1);
        verify(chatAttachmentStorage).deleteQuietly("expired.bin");
        verify(chatAttachmentRepository).deleteAll(List.of(expiredAttachment));
    }

    @Test
    void cleanupOrphanedAttachmentsSkipsWhenTtlIsDisabled() {
        ChatAttachmentRepository chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        ChatAttachmentStorage chatAttachmentStorage = mock(ChatAttachmentStorage.class);
        ChatAttachmentService service = chatAttachmentService(
                chatAttachmentRepository,
                chatAttachmentStorage,
                Duration.ZERO
        );

        int deletedCount = service.cleanupOrphanedAttachments(Instant.parse("2026-04-21T10:00:00Z"));

        assertThat(deletedCount).isZero();
        verifyNoInteractions(chatAttachmentRepository, chatAttachmentStorage);
    }

    private static ChatAttachmentService chatAttachmentService(
            ChatAttachmentRepository chatAttachmentRepository,
            ChatAttachmentStorage chatAttachmentStorage,
            Duration orphanTtl
    ) {
        return new ChatAttachmentService(
                mock(AuthService.class),
                mock(ChatService.class),
                chatAttachmentRepository,
                mock(ChatParticipantRepository.class),
                mock(ChatRoomBanRepository.class),
                chatAttachmentStorage,
                new ChatAttachmentStorageProperties(
                        25L * 1024L * 1024L,
                        orphanTtl,
                        900_000L,
                        null
                ),
                mock(ClusterJobLockService.class)
        );
    }

    @Test
    void createDownloadUrlRejectsAttachmentOutsideViewerVisibilityWindow() {
        ChatAttachmentRepository chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        ChatAttachmentStorage chatAttachmentStorage = mock(ChatAttachmentStorage.class);
        AuthService authService = mock(AuthService.class);
        ChatService chatService = mock(ChatService.class);
        ChatParticipantRepository chatParticipantRepository = mock(ChatParticipantRepository.class);
        ChatRoomBanRepository chatRoomBanRepository = mock(ChatRoomBanRepository.class);

        UUID chatId = UUID.randomUUID();
        UUID attachmentId = UUID.randomUUID();
        UUID viewerId = UUID.randomUUID();
        UUID uploaderId = UUID.randomUUID();

        UserAccount viewer = mock(UserAccount.class);
        when(viewer.getId()).thenReturn(viewerId);
        when(authService.requireAuthenticatedUser("viewer")).thenReturn(viewer);

        ChatRoom room = mock(ChatRoom.class);
        when(room.getId()).thenReturn(chatId);
        when(room.isDirect()).thenReturn(false);
        when(room.getPrejoinHistoryPolicy()).thenReturn(ChatPrejoinHistoryPolicy.JOIN_ONLY);
        when(chatService.requireChatMembership(chatId, viewer)).thenReturn(room);

        ChatAttachment attachment = mock(ChatAttachment.class);
        when(attachment.getId()).thenReturn(attachmentId);
        when(attachment.getUploaderId()).thenReturn(uploaderId);
        when(chatAttachmentRepository.findByIdAndChatId(attachmentId, chatId)).thenReturn(Optional.of(attachment));

        ChatParticipant membership = mock(ChatParticipant.class);
        when(membership.getUserId()).thenReturn(viewerId);
        when(membership.getJoinedAt()).thenReturn(Instant.parse("2026-01-01T00:00:00Z"));
        when(membership.getLeftAt()).thenReturn(Instant.parse("2026-02-01T00:00:00Z"));
        when(membership.getPrejoinHistoryAccessGrantedAt()).thenReturn(null);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, viewerId)).thenReturn(Optional.of(membership));
        when(chatRoomBanRepository.findByChatIdAndUserId(chatId, viewerId)).thenReturn(Optional.empty());

        when(chatAttachmentRepository.existsVisibleAttachment(
                eq(attachmentId), eq(chatId), eq(viewerId), eq(true), any(), eq(true), any()))
                .thenReturn(false);

        ChatAttachmentService service = new ChatAttachmentService(
                authService,
                chatService,
                chatAttachmentRepository,
                chatParticipantRepository,
                chatRoomBanRepository,
                chatAttachmentStorage,
                new ChatAttachmentStorageProperties(25L * 1024L * 1024L, Duration.ofHours(1), 900_000L, null),
                mock(ClusterJobLockService.class)
        );

        assertThatThrownBy(() -> service.createDownloadUrl("viewer", chatId, attachmentId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));

        // Must reject before touching storage so no presigned URL is minted for a hidden attachment.
        verify(chatAttachmentStorage, never()).exists(org.mockito.ArgumentMatchers.anyString());
        verify(chatAttachmentStorage, never()).createDirectDownload(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString());
    }
}
