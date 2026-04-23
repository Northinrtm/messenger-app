package com.north.messenger.application.message;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
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
class MessageDispatchOutboxProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(MessageDispatchOutboxProcessor.class);
    private static final long MESSAGE_DISPATCH_OUTBOX_LOCK_ID = 7_101_002L;

    private final MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    private final MessageDispatchService messageDispatchService;
    private final ClusterJobLockService clusterJobLockService;
    private final int batchSize;
    private final long retryDelayMs;

    MessageDispatchOutboxProcessor(
            MessageDispatchOutboxRepository messageDispatchOutboxRepository,
            MessageDispatchService messageDispatchService,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.outbox.message-dispatch.batch-size:32}") int batchSize,
            @Value("${app.outbox.message-dispatch.retry-delay-ms:3000}") long retryDelayMs
    ) {
        this.messageDispatchOutboxRepository = messageDispatchOutboxRepository;
        this.messageDispatchService = messageDispatchService;
        this.clusterJobLockService = clusterJobLockService;
        this.batchSize = Math.max(1, batchSize);
        this.retryDelayMs = Math.max(250L, retryDelayMs);
    }

    @Transactional
    public void drainAvailableEntries() {
        runDueEntriesDrain(Instant.now());
    }

    @Scheduled(
            fixedDelayString = "${app.outbox.message-dispatch.poll-fixed-delay-ms:5000}",
            initialDelayString = "${app.outbox.message-dispatch.poll-fixed-delay-ms:5000}"
    )
    @Transactional
    public void drainScheduledEntries() {
        runDueEntriesDrain(Instant.now());
    }

    int processDueEntries(Instant now) {
        List<MessageDispatchOutboxEntry> dueEntries =
                messageDispatchOutboxRepository.findAllByProcessedAtIsNullAndAvailableAtLessThanEqualOrderByCreatedAtAsc(
                        now,
                        PageRequest.of(0, batchSize)
                );
        if (dueEntries.isEmpty()) {
            return 0;
        }

        dueEntries.forEach(entry -> processEntry(entry, now));
        return dueEntries.size();
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
        }
        messageDispatchOutboxRepository.save(entry);
    }

    private void runDueEntriesDrain(Instant now) {
        clusterJobLockService.runIfLockAcquired(
                MESSAGE_DISPATCH_OUTBOX_LOCK_ID,
                () -> {
                    processDueEntries(now);
                }
        );
    }

    private long nextRetryDelayMs(MessageDispatchOutboxEntry entry) {
        long multiplier = Math.min(8L, Math.max(1L, (long) entry.getAttemptCount() + 1L));
        return retryDelayMs * multiplier;
    }
}
