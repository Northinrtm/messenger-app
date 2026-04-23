package com.north.messenger.application.message;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageDispatchOutboxProcessorTest {

    private MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    private MessageDispatchService messageDispatchService;
    private MessageDispatchOutboxProcessor messageDispatchOutboxProcessor;

    @BeforeEach
    void setUp() {
        messageDispatchOutboxRepository = mock(MessageDispatchOutboxRepository.class);
        messageDispatchService = mock(MessageDispatchService.class);
        ClusterJobLockService clusterJobLockService = mock(ClusterJobLockService.class);
        messageDispatchOutboxProcessor = new MessageDispatchOutboxProcessor(
                messageDispatchOutboxRepository,
                messageDispatchService,
                clusterJobLockService,
                32,
                3_000L
        );
        when(messageDispatchOutboxRepository.save(any(MessageDispatchOutboxEntry.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void processDueEntriesShouldMarkEntryProcessedAfterSuccessfulDispatch() {
        Instant now = Instant.parse("2026-04-23T16:00:00Z");
        MessageDispatchOutboxEntry entry = new MessageDispatchOutboxEntry(
                UUID.randomUUID(),
                new MessageDispatchEvent(UUID.randomUUID(), UUID.randomUUID(), "client-1", MessageDispatchMode.FULL),
                now.minusSeconds(5)
        );
        when(messageDispatchOutboxRepository.findAllByProcessedAtIsNullAndAvailableAtLessThanEqualOrderByCreatedAtAsc(
                any(),
                any()
        )).thenReturn(List.of(entry));

        int processedCount = messageDispatchOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getAttemptCount()).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isEqualTo(now);
        assertThat(entry.getAvailableAt()).isEqualTo(now);
        assertThat(entry.getLastError()).isNull();
        verify(messageDispatchService).dispatchMessage(entry.toEvent(), "outbox");
        verify(messageDispatchOutboxRepository).save(entry);
    }

    @Test
    void processDueEntriesShouldKeepEntryPendingAndScheduleRetryAfterFailure() {
        Instant now = Instant.parse("2026-04-23T16:00:00Z");
        MessageDispatchOutboxEntry entry = new MessageDispatchOutboxEntry(
                UUID.randomUUID(),
                new MessageDispatchEvent(UUID.randomUUID(), UUID.randomUUID(), "client-2", MessageDispatchMode.ACK_ONLY),
                now.minusSeconds(5)
        );
        when(messageDispatchOutboxRepository.findAllByProcessedAtIsNullAndAvailableAtLessThanEqualOrderByCreatedAtAsc(
                any(),
                any()
        )).thenReturn(List.of(entry));
        doThrow(new IllegalStateException("simulated dispatch failure"))
                .when(messageDispatchService)
                .dispatchMessage(any(MessageDispatchEvent.class), any());

        int processedCount = messageDispatchOutboxProcessor.processDueEntries(now);

        assertThat(processedCount).isEqualTo(1);
        assertThat(entry.getAttemptCount()).isEqualTo(1);
        assertThat(entry.getProcessedAt()).isNull();
        assertThat(entry.getAvailableAt()).isEqualTo(now.plusSeconds(3));
        assertThat(entry.getLastError()).contains("simulated dispatch failure");
        verify(messageDispatchOutboxRepository).save(entry);
    }
}
