package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class E2eeMaintenanceOutboxProcessorTest {

    private E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository;
    private ChatRoomRepository chatRoomRepository;
    private UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private ClusterJobLockService clusterJobLockService;
    private E2eeMaintenanceOutboxProcessor e2eeMaintenanceOutboxProcessor;

    @BeforeEach
    void setUp() {
        e2eeMaintenanceOutboxRepository = mock(E2eeMaintenanceOutboxRepository.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        userEncryptionAccountKeyRepository = mock(UserEncryptionAccountKeyRepository.class);
        chatGroupHistoryKeyService = mock(ChatGroupHistoryKeyService.class);
        clusterJobLockService = mock(ClusterJobLockService.class);
        e2eeMaintenanceOutboxProcessor = new E2eeMaintenanceOutboxProcessor(
                e2eeMaintenanceOutboxRepository,
                chatRoomRepository,
                userEncryptionAccountKeyRepository,
                chatGroupHistoryKeyService,
                clusterJobLockService,
                16,
                4,
                3000
        );

        when(e2eeMaintenanceOutboxRepository.save(any(E2eeMaintenanceOutboxEntry.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void processDueEntriesShouldDispatchRotationJobs() {
        Instant now = Instant.parse("2026-05-02T08:30:00Z");
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        E2eeMaintenanceOutboxEntry entry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.ROTATE_CHAT_ACTIVE_HISTORY_KEY,
                "rotate:" + chatId,
                chatId,
                null,
                grantorUserId,
                4L,
                null,
                now.minusSeconds(5)
        );
        when(e2eeMaintenanceOutboxRepository.lockDueEntriesForProcessing(now, 16))
                .thenReturn(List.of(entry));
        when(chatRoomRepository.findMembershipVersionByChatId(chatId)).thenReturn(Optional.of(4L));

        int processedCount = e2eeMaintenanceOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isEqualTo(now);
        verify(chatGroupHistoryKeyService).rotateActiveHistoryKeyForCurrentParticipants(chatId, grantorUserId);
        verify(e2eeMaintenanceOutboxRepository).save(entry);
    }

    @Test
    void processDueEntriesShouldSkipStaleRotationJobs() {
        Instant now = Instant.parse("2026-05-02T08:30:00Z");
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        E2eeMaintenanceOutboxEntry entry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.ROTATE_CHAT_ACTIVE_HISTORY_KEY,
                "rotate:" + chatId,
                chatId,
                null,
                grantorUserId,
                4L,
                null,
                now.minusSeconds(5)
        );
        when(e2eeMaintenanceOutboxRepository.lockDueEntriesForProcessing(now, 16))
                .thenReturn(List.of(entry));
        when(chatRoomRepository.findMembershipVersionByChatId(chatId)).thenReturn(Optional.of(5L));

        int processedCount = e2eeMaintenanceOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isEqualTo(now);
        verify(chatGroupHistoryKeyService, never())
                .rotateActiveHistoryKeyForCurrentParticipants(chatId, grantorUserId);
        verify(e2eeMaintenanceOutboxRepository).save(entry);
    }

    @Test
    void processDueEntriesShouldRetryFailedRefreshJobs() {
        Instant now = Instant.parse("2026-05-02T08:30:00Z");
        UUID recipientUserId = UUID.randomUUID();
        E2eeMaintenanceOutboxEntry entry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.REFRESH_VISIBLE_HISTORY_ACCESS,
                "refresh:" + recipientUserId,
                null,
                recipientUserId,
                null,
                null,
                3L,
                now.minusSeconds(5)
        );
        when(e2eeMaintenanceOutboxRepository.lockDueEntriesForProcessing(now, 16))
                .thenReturn(List.of(entry));
        when(userEncryptionAccountKeyRepository.findAccountKeyVersionByUserId(recipientUserId))
                .thenReturn(Optional.of(3L));
        doThrow(new IllegalStateException("refresh failed"))
                .when(chatGroupHistoryKeyService)
                .refreshVisibleHistoryAccessForRecipient(recipientUserId);

        int processedCount = e2eeMaintenanceOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isNull();
        assertThat(entry.getAvailableAt()).isAfter(now);
        assertThat(entry.getLastError()).isEqualTo("refresh failed");
        verify(e2eeMaintenanceOutboxRepository).save(entry);
    }

    @Test
    void processDueEntriesShouldSkipStaleRefreshJobs() {
        Instant now = Instant.parse("2026-05-02T08:30:00Z");
        UUID recipientUserId = UUID.randomUUID();
        E2eeMaintenanceOutboxEntry entry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.REFRESH_VISIBLE_HISTORY_ACCESS,
                "refresh:" + recipientUserId,
                null,
                recipientUserId,
                null,
                null,
                3L,
                now.minusSeconds(5)
        );
        when(e2eeMaintenanceOutboxRepository.lockDueEntriesForProcessing(now, 16))
                .thenReturn(List.of(entry));
        when(userEncryptionAccountKeyRepository.findAccountKeyVersionByUserId(recipientUserId))
                .thenReturn(Optional.of(4L));

        int processedCount = e2eeMaintenanceOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isEqualTo(now);
        verify(chatGroupHistoryKeyService, never())
                .refreshVisibleHistoryAccessForRecipient(recipientUserId);
        verify(e2eeMaintenanceOutboxRepository).save(entry);
    }
}
