package com.north.messenger.application.message;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageDispatchOutboxProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(MessageDispatchOutboxProcessor.class);
    private static final long MESSAGE_DISPATCH_OUTBOX_LOCK_ID = 7_101_002L;

    private final MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    private final MessageDispatchService messageDispatchService;
    private final ClusterJobLockService clusterJobLockService;
    private final int batchSize;
    private final int maxBatchesPerDrain;
    private final long retryDelayMs;

    MessageDispatchOutboxProcessor(
            MessageDispatchOutboxRepository messageDispatchOutboxRepository,
            MessageDispatchService messageDispatchService,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.outbox.message-dispatch.batch-size:128}") int batchSize,
            @Value("${app.outbox.message-dispatch.max-batches-per-drain:16}") int maxBatchesPerDrain,
            @Value("${app.outbox.message-dispatch.retry-delay-ms:3000}") long retryDelayMs
    ) {
        this.messageDispatchOutboxRepository = messageDispatchOutboxRepository;
        this.messageDispatchService = messageDispatchService;
        this.clusterJobLockService = clusterJobLockService;
        this.batchSize = Math.max(1, batchSize);
        this.maxBatchesPerDrain = Math.max(1, maxBatchesPerDrain);
        this.retryDelayMs = Math.max(250L, retryDelayMs);
    }

    @Transactional
    public void drainAvailableEntries() {
        runDueEntriesDrain(Instant.now());
    }

    @Scheduled(
            fixedDelayString = "${app.outbox.message-dispatch.poll-fixed-delay-ms:1000}",
            initialDelayString = "${app.outbox.message-dispatch.poll-fixed-delay-ms:1000}"
    )
    @Transactional
    public void drainScheduledEntries() {
        runDueEntriesDrain(Instant.now());
    }

    int processDueEntries(Instant now) {
        int processedCount = 0;
        for (int batchIndex = 0; batchIndex < maxBatchesPerDrain; batchIndex += 1) {
            List<MessageDispatchOutboxEntry> dueEntries =
                    messageDispatchOutboxRepository.lockDueEntriesForProcessing(now, batchSize);
            if (dueEntries.isEmpty()) {
                break;
            }

            dueEntries.forEach(entry -> processEntry(entry, now));
            processedCount += dueEntries.size();
            if (dueEntries.size() < batchSize) {
                break;
            }
        }
        return processedCount;
    }

    private void processEntry(MessageDispatchOutboxEntry entry, Instant now) {
        try {
            messageDispatchService.dispatchMessage(entry.toEvent(), "outbox");
            entry.markProcessed(now);
        } catch (RuntimeException exception) {
            Instant nextAttemptAt = now.plusMillis(nextRetryDelayMs(entry));
            entry.markFailed(nextAttemptAt, exception.getMessage());
            LOGGER.warn(
                    "Message dispatch outbox processing failed for entry {} and message {}",
                    entry.getId(),
                    entry.getMessageId(),
                    exception
            );
            MessageSendDiagnostics.logFailure(
                    "outbox",
                    "dispatch.retry_scheduled",
                    entry.getChatId(),
                    entry.getMessageId(),
                    null,
                    entry.getClientMessageId(),
                    null,
                    exception.getMessage(),
                    List.of(
                            "entryId=" + entry.getId(),
                            "dispatchMode=" + entry.getDispatchMode(),
                            "attempt=" + entry.getAttemptCount(),
                            "nextAvailableAt=" + nextAttemptAt
                    ),
                    exception
            );
        }
        messageDispatchOutboxRepository.save(entry);
    }

    private void runDueEntriesDrain(Instant now) {
        clusterJobLockService.runIfLockAcquired(
                MESSAGE_DISPATCH_OUTBOX_LOCK_ID,
                () -> {
                    int processedCount = processDueEntries(now);
                    if (processedCount >= batchSize * maxBatchesPerDrain) {
                        LOGGER.debug(
                                "Message dispatch outbox drain reached per-run budget processedCount={} batchSize={} maxBatchesPerDrain={}",
                                processedCount,
                                batchSize,
                                maxBatchesPerDrain
                        );
                    }
                }
        );
    }

    private long nextRetryDelayMs(MessageDispatchOutboxEntry entry) {
        long multiplier = Math.min(8L, Math.max(1L, (long) entry.getAttemptCount() + 1L));
        return retryDelayMs * multiplier;
    }
}
