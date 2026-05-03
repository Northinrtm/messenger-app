package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class E2eeMaintenanceOutboxCleanupServiceTest {

    @Test
    void cleanupProcessedEntriesDeletesExpiredEntries() {
        E2eeMaintenanceOutboxRepository repository = mock(E2eeMaintenanceOutboxRepository.class);
        Instant now = Instant.parse("2026-05-02T11:00:00Z");
        E2eeMaintenanceOutboxEntry processedEntry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                E2eeMaintenanceJobType.REFRESH_VISIBLE_HISTORY_ACCESS,
                "refresh:user-1",
                null,
                UUID.randomUUID(),
                null,
                null,
                2L,
                now.minus(Duration.ofDays(9))
        );
        processedEntry.markProcessed(now.minus(Duration.ofDays(8)));
        when(repository.findAllByProcessedAtBeforeOrderByProcessedAtAsc(any(), any()))
                .thenReturn(List.of(processedEntry));

        E2eeMaintenanceOutboxCleanupService service = new E2eeMaintenanceOutboxCleanupService(
                repository,
                mock(ClusterJobLockService.class),
                Duration.ofDays(7),
                500,
                8
        );

        int deletedCount = service.cleanupProcessedEntries(now);

        assertThat(deletedCount).isEqualTo(1);
        verify(repository).deleteAllInBatch(List.of(processedEntry));
    }

    @Test
    void cleanupProcessedEntriesSkipsWhenRetentionDisabled() {
        E2eeMaintenanceOutboxRepository repository = mock(E2eeMaintenanceOutboxRepository.class);
        E2eeMaintenanceOutboxCleanupService service = new E2eeMaintenanceOutboxCleanupService(
                repository,
                mock(ClusterJobLockService.class),
                Duration.ZERO,
                500,
                8
        );

        int deletedCount = service.cleanupProcessedEntries(Instant.parse("2026-05-02T11:00:00Z"));

        assertThat(deletedCount).isZero();
        verifyNoInteractions(repository);
    }
}
