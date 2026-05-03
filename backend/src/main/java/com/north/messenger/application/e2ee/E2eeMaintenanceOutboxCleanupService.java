package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class E2eeMaintenanceOutboxCleanupService {

    private static final Logger LOGGER = LoggerFactory.getLogger(E2eeMaintenanceOutboxCleanupService.class);
    private static final long E2EE_MAINTENANCE_OUTBOX_CLEANUP_LOCK_ID = 7_101_005L;

    private final E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository;
    private final ClusterJobLockService clusterJobLockService;
    private final Duration retention;
    private final int cleanupBatchSize;
    private final int maxBatchesPerRun;

    E2eeMaintenanceOutboxCleanupService(
            E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.outbox.e2ee-maintenance.retention:P7D}") Duration retention,
            @Value("${app.outbox.e2ee-maintenance.cleanup-batch-size:500}") int cleanupBatchSize,
            @Value("${app.outbox.e2ee-maintenance.cleanup-max-batches-per-run:8}") int maxBatchesPerRun
    ) {
        this.e2eeMaintenanceOutboxRepository = e2eeMaintenanceOutboxRepository;
        this.clusterJobLockService = clusterJobLockService;
        this.retention = retention;
        this.cleanupBatchSize = Math.max(1, cleanupBatchSize);
        this.maxBatchesPerRun = Math.max(1, maxBatchesPerRun);
    }

    @Scheduled(
            fixedDelayString = "${app.outbox.e2ee-maintenance.cleanup-fixed-delay-ms:3600000}",
            initialDelayString = "${app.outbox.e2ee-maintenance.cleanup-fixed-delay-ms:3600000}"
    )
    @Transactional
    public void cleanupProcessedEntries() {
        clusterJobLockService.runIfLockAcquired(
                E2EE_MAINTENANCE_OUTBOX_CLEANUP_LOCK_ID,
                () -> cleanupProcessedEntries(Instant.now())
        );
    }

    @Transactional
    int cleanupProcessedEntries(Instant now) {
        if (retention == null || retention.isZero() || retention.isNegative()) {
            return 0;
        }

        Instant cutoff = now.minus(retention);
        int deletedCount = 0;
        for (int batchIndex = 0; batchIndex < maxBatchesPerRun; batchIndex += 1) {
            List<E2eeMaintenanceOutboxEntry> processedEntries = e2eeMaintenanceOutboxRepository
                    .findAllByProcessedAtBeforeOrderByProcessedAtAsc(
                            cutoff,
                            PageRequest.of(0, cleanupBatchSize)
                    );
            if (processedEntries.isEmpty()) {
                break;
            }

            e2eeMaintenanceOutboxRepository.deleteAllInBatch(processedEntries);
            deletedCount += processedEntries.size();
            if (processedEntries.size() < cleanupBatchSize) {
                break;
            }
        }

        if (deletedCount > 0) {
            LOGGER.info(
                    "Cleaned processed E2EE maintenance outbox entries deletedCount={} retention={} cutoff={}",
                    deletedCount,
                    retention,
                    cutoff
            );
        }
        if (deletedCount >= cleanupBatchSize * maxBatchesPerRun) {
            LOGGER.warn(
                    "E2EE maintenance outbox cleanup reached per-run budget deletedCount={} cleanupBatchSize={} maxBatchesPerRun={}",
                    deletedCount,
                    cleanupBatchSize,
                    maxBatchesPerRun
            );
        }
        return deletedCount;
    }
}
