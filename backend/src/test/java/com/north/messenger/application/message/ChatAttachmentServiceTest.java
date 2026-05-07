package com.north.messenger.application.message;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
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
}
