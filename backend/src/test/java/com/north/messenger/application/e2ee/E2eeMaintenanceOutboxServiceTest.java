package com.north.messenger.application.e2ee;

import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class E2eeMaintenanceOutboxServiceTest {

    private ChatRoomRepository chatRoomRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository;
    private UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private ApplicationEventPublisher eventPublisher;
    private E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService;

    @BeforeEach
    void setUp() {
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        e2eeMaintenanceOutboxRepository = mock(E2eeMaintenanceOutboxRepository.class);
        userEncryptionAccountKeyRepository = mock(UserEncryptionAccountKeyRepository.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        e2eeMaintenanceOutboxService = new E2eeMaintenanceOutboxService(
                chatRoomRepository,
                chatParticipantRepository,
                e2eeMaintenanceOutboxRepository,
                userEncryptionAccountKeyRepository,
                eventPublisher
        );

        when(e2eeMaintenanceOutboxRepository.save(any(E2eeMaintenanceOutboxEntry.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void enqueueRotationShouldInsertPendingJobAndPublishQueuedEvent() {
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        when(chatRoomRepository.findMembershipVersionByChatId(chatId)).thenReturn(Optional.of(4L));
        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull("rotate:" + chatId))
                .thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueRotation(chatId, grantorUserId);

        verify(e2eeMaintenanceOutboxRepository).save(any(E2eeMaintenanceOutboxEntry.class));
        verify(eventPublisher).publishEvent(any(E2eeMaintenanceOutboxQueuedEvent.class));
    }

    @Test
    void enqueueRotationShouldSkipMissingChatMembershipVersion() {
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        when(chatRoomRepository.findMembershipVersionByChatId(chatId)).thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueRotation(chatId, grantorUserId);

        verify(e2eeMaintenanceOutboxRepository, times(0)).save(any(E2eeMaintenanceOutboxEntry.class));
        verify(eventPublisher, times(0)).publishEvent(any(E2eeMaintenanceOutboxQueuedEvent.class));
    }

    @Test
    void enqueueBackfillShouldDeduplicateExistingPendingRecipientJobs() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID otherRecipientUserId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        E2eeMaintenanceOutboxEntry existingEntry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.BACKFILL_CHAT_HISTORY_ACCESS,
                "backfill:" + chatId + ":" + recipientUserId,
                chatId,
                recipientUserId,
                null,
                null,
                null,
                Instant.parse("2026-05-02T08:00:00Z")
        );

        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull(
                "backfill:" + chatId + ":" + recipientUserId
        )).thenReturn(Optional.of(existingEntry));
        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull(
                "backfill:" + chatId + ":" + otherRecipientUserId
        )).thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueBackfill(
                chatId,
                Set.of(recipientUserId, otherRecipientUserId),
                grantorUserId
        );

        verify(e2eeMaintenanceOutboxRepository, times(2)).save(any(E2eeMaintenanceOutboxEntry.class));
        assertThat(existingEntry.getPrimaryGrantorUserId()).isEqualTo(grantorUserId);
        verify(eventPublisher).publishEvent(any(E2eeMaintenanceOutboxQueuedEvent.class));
    }

    @Test
    void enqueueRefreshVisibleHistoryAccessShouldInsertVersionScopedPendingJob() {
        UUID recipientUserId = UUID.randomUUID();
        when(userEncryptionAccountKeyRepository.findAccountKeyVersionByUserId(recipientUserId))
                .thenReturn(Optional.of(3L));
        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull("refresh:" + recipientUserId))
                .thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueRefreshVisibleHistoryAccess(recipientUserId);

        verify(e2eeMaintenanceOutboxRepository).save(any(E2eeMaintenanceOutboxEntry.class));
        verify(eventPublisher).publishEvent(any(E2eeMaintenanceOutboxQueuedEvent.class));
    }

    @Test
    void enqueueRefreshVisibleHistoryAccessShouldSkipMissingAccountKeyVersion() {
        UUID recipientUserId = UUID.randomUUID();
        when(userEncryptionAccountKeyRepository.findAccountKeyVersionByUserId(recipientUserId))
                .thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueRefreshVisibleHistoryAccess(recipientUserId);

        verify(e2eeMaintenanceOutboxRepository, times(0)).save(any(E2eeMaintenanceOutboxEntry.class));
        verify(eventPublisher, times(0)).publishEvent(any(E2eeMaintenanceOutboxQueuedEvent.class));
    }

    @Test
    void enqueueRotationForUserChatsShouldEnqueueDistinctMembershipChats() {
        UUID userId = UUID.randomUUID();
        UUID firstChatId = UUID.randomUUID();
        UUID secondChatId = UUID.randomUUID();
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(userId)).thenReturn(List.of(
                new ChatParticipant(UUID.randomUUID(), firstChatId, userId, Instant.parse("2026-05-02T08:00:00Z")),
                new ChatParticipant(UUID.randomUUID(), firstChatId, userId, Instant.parse("2026-05-02T08:01:00Z")),
                new ChatParticipant(UUID.randomUUID(), secondChatId, userId, Instant.parse("2026-05-02T08:02:00Z"))
        ));
        when(chatRoomRepository.findMembershipVersionByChatId(firstChatId)).thenReturn(Optional.of(2L));
        when(chatRoomRepository.findMembershipVersionByChatId(secondChatId)).thenReturn(Optional.of(4L));
        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull("rotate:" + firstChatId))
                .thenReturn(Optional.empty());
        when(e2eeMaintenanceOutboxRepository.findByDedupeKeyAndProcessedAtIsNull("rotate:" + secondChatId))
                .thenReturn(Optional.empty());

        e2eeMaintenanceOutboxService.enqueueRotationForUserChats(userId);

        verify(chatParticipantRepository).findAllByUserIdOrderByJoinedAtAsc(userId);
        verify(chatRoomRepository).findMembershipVersionByChatId(firstChatId);
        verify(chatRoomRepository).findMembershipVersionByChatId(secondChatId);
        verify(e2eeMaintenanceOutboxRepository, times(2)).save(any(E2eeMaintenanceOutboxEntry.class));
    }
}
