package com.north.messenger.application.message;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
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

class MessageDispatchOutboxCleanupServiceTest {

    @Test
    void cleanupProcessedEntriesDeletesExpiredEntries() {
        MessageDispatchOutboxRepository repository = mock(MessageDispatchOutboxRepository.class);
        Instant now = Instant.parse("2026-05-02T11:00:00Z");
        MessageDispatchOutboxEntry processedEntry = new MessageDispatchOutboxEntry(
                UUID.randomUUID(),
                new MessageDispatchEvent(UUID.randomUUID(), UUID.randomUUID(), "client-1", MessageDispatchMode.FULL),
                now.minus(Duration.ofDays(9))
        );
        processedEntry.markProcessed(now.minus(Duration.ofDays(8)));
        when(repository.findAllByProcessedAtBeforeOrderByProcessedAtAsc(any(), any()))
                .thenReturn(List.of(processedEntry));

        MessageDispatchOutboxCleanupService service = new MessageDispatchOutboxCleanupService(
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
        MessageDispatchOutboxRepository repository = mock(MessageDispatchOutboxRepository.class);
        MessageDispatchOutboxCleanupService service = new MessageDispatchOutboxCleanupService(
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
