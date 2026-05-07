package com.north.messenger.observability;

import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.TimeGauge;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class OutboxMetrics {

    private static final Logger log = LoggerFactory.getLogger(OutboxMetrics.class);

    private final MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    public OutboxMetrics(
            MeterRegistry meterRegistry,
            MessageDispatchOutboxRepository messageDispatchOutboxRepository
    ) {
        this.messageDispatchOutboxRepository = messageDispatchOutboxRepository;

        registerCountGauge(
                meterRegistry,
                "messenger.outbox.pending",
                "Pending outbox entries that have not been processed yet",
                "message_dispatch",
                this::messageDispatchPendingCount
        );
        registerCountGauge(
                meterRegistry,
                "messenger.outbox.due",
                "Pending outbox entries that are already due for processing",
                "message_dispatch",
                this::messageDispatchDueCount
        );
        registerLagGauge(
                meterRegistry,
                "message_dispatch",
                this::messageDispatchOldestDueLagSeconds
        );

    }

    double messageDispatchPendingCount() {
        return safeCount("message_dispatch.pending", messageDispatchOutboxRepository::countByProcessedAtIsNull);
    }

    double messageDispatchDueCount() {
        Instant now = Instant.now();
        return safeCount(
                "message_dispatch.due",
                () -> messageDispatchOutboxRepository.countByProcessedAtIsNullAndAvailableAtLessThanEqual(now)
        );
    }

    double messageDispatchOldestDueLagSeconds() {
        Instant now = Instant.now();
        return safeLag(
                "message_dispatch.oldest_due_lag",
                now,
                () -> messageDispatchOutboxRepository.findOldestDueAvailableAt(now)
        );
    }

    private void registerCountGauge(
            MeterRegistry meterRegistry,
            String name,
            String description,
            String queue,
            DoubleSupplier supplier
    ) {
        Gauge.builder(name, supplier::getAsDouble)
                .description(description)
                .baseUnit("entries")
                .tag("queue", queue)
                .register(meterRegistry);
    }

    private void registerLagGauge(
            MeterRegistry meterRegistry,
            String queue,
            DoubleSupplier supplier
    ) {
        TimeGauge.builder("messenger.outbox.oldest.due.lag", supplier::getAsDouble, TimeUnit.SECONDS)
                .description("Age of the oldest outbox entry that is already due for processing")
                .tag("queue", queue)
                .register(meterRegistry);
    }

    private double safeCount(String metricName, LongSupplier supplier) {
        try {
            return supplier.getAsLong();
        } catch (RuntimeException exception) {
            log.warn("Failed to read outbox count metric {}", metricName, exception);
            return Double.NaN;
        }
    }

    private double safeLag(String metricName, Instant now, Supplier<Instant> supplier) {
        try {
            Instant oldestDueAvailableAt = supplier.get();
            if (oldestDueAvailableAt == null) {
                return 0D;
            }
            return Math.max(0D, Duration.between(oldestDueAvailableAt, now).toMillis() / 1000D);
        } catch (RuntimeException exception) {
            log.warn("Failed to read outbox lag metric {}", metricName, exception);
            return Double.NaN;
        }
    }
}
