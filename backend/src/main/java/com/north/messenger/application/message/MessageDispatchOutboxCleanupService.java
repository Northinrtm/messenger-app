package com.north.messenger.application.message;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
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
class MessageDispatchOutboxCleanupService {

    private static final Logger LOGGER = LoggerFactory.getLogger(MessageDispatchOutboxCleanupService.class);
    private static final long MESSAGE_DISPATCH_OUTBOX_CLEANUP_LOCK_ID = 7_101_004L;

    private final MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    private final ClusterJobLockService clusterJobLockService;
    private final Duration retention;
    private final int cleanupBatchSize;
    private final int maxBatchesPerRun;

    MessageDispatchOutboxCleanupService(
            MessageDispatchOutboxRepository messageDispatchOutboxRepository,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.outbox.message-dispatch.retention:P7D}") Duration retention,
            @Value("${app.outbox.message-dispatch.cleanup-batch-size:500}") int cleanupBatchSize,
            @Value("${app.outbox.message-dispatch.cleanup-max-batches-per-run:8}") int maxBatchesPerRun
    ) {
        this.messageDispatchOutboxRepository = messageDispatchOutboxRepository;
        this.clusterJobLockService = clusterJobLockService;
        this.retention = retention;
        this.cleanupBatchSize = Math.max(1, cleanupBatchSize);
        this.maxBatchesPerRun = Math.max(1, maxBatchesPerRun);
    }

    @Scheduled(
            fixedDelayString = "${app.outbox.message-dispatch.cleanup-fixed-delay-ms:3600000}",
            initialDelayString = "${app.outbox.message-dispatch.cleanup-fixed-delay-ms:3600000}"
    )
    @Transactional
    public void cleanupProcessedEntries() {
        clusterJobLockService.runIfLockAcquired(
                MESSAGE_DISPATCH_OUTBOX_CLEANUP_LOCK_ID,
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
            List<MessageDispatchOutboxEntry> processedEntries = messageDispatchOutboxRepository
                    .findAllByProcessedAtBeforeOrderByProcessedAtAsc(
                            cutoff,
                            PageRequest.of(0, cleanupBatchSize)
                    );
            if (processedEntries.isEmpty()) {
                break;
            }

            messageDispatchOutboxRepository.deleteAllInBatch(processedEntries);
            deletedCount += processedEntries.size();
            if (processedEntries.size() < cleanupBatchSize) {
                break;
            }
        }

        if (deletedCount > 0) {
            LOGGER.info(
                    "Cleaned processed message dispatch outbox entries deletedCount={} retention={} cutoff={}",
                    deletedCount,
                    retention,
                    cutoff
            );
        }
        if (deletedCount >= cleanupBatchSize * maxBatchesPerRun) {
            LOGGER.warn(
                    "Message dispatch outbox cleanup reached per-run budget deletedCount={} cleanupBatchSize={} maxBatchesPerRun={}",
                    deletedCount,
                    cleanupBatchSize,
                    maxBatchesPerRun
            );
        }
        return deletedCount;
    }
}
