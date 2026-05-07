package com.north.messenger.observability;

import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OutboxMetricsTest {

    @Test
    void registersOutboxBacklogAndLagGauges() {
        MessageDispatchOutboxRepository messageDispatchOutboxRepository = mock(MessageDispatchOutboxRepository.class);
        Instant now = Instant.now();

        when(messageDispatchOutboxRepository.countByProcessedAtIsNull()).thenReturn(12L);
        when(messageDispatchOutboxRepository.countByProcessedAtIsNullAndAvailableAtLessThanEqual(org.mockito.ArgumentMatchers.any()))
                .thenReturn(4L);
        when(messageDispatchOutboxRepository.findOldestDueAvailableAt(org.mockito.ArgumentMatchers.any()))
                .thenReturn(now.minusSeconds(30));

        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxMetrics(
                meterRegistry,
                messageDispatchOutboxRepository
        );

        assertThat(meterRegistry.get("messenger.outbox.pending").tag("queue", "message_dispatch").gauge().value())
                .isEqualTo(12D);
        assertThat(meterRegistry.get("messenger.outbox.due").tag("queue", "message_dispatch").gauge().value())
                .isEqualTo(4D);
        assertThat(meterRegistry.get("messenger.outbox.oldest.due.lag")
                .tag("queue", "message_dispatch")
                .gauge()
                .value()).isBetween(29D, 31.5D);
    }
}
