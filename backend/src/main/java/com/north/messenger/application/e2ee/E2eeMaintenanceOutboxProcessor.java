package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class E2eeMaintenanceOutboxProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(E2eeMaintenanceOutboxProcessor.class);
    private static final long E2EE_MAINTENANCE_OUTBOX_LOCK_ID = 7_101_003L;

    private final E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private final ClusterJobLockService clusterJobLockService;
    private final int batchSize;
    private final int maxBatchesPerDrain;
    private final long retryDelayMs;

    E2eeMaintenanceOutboxProcessor(
            E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository,
            ChatRoomRepository chatRoomRepository,
            UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.outbox.e2ee-maintenance.batch-size:128}") int batchSize,
            @Value("${app.outbox.e2ee-maintenance.max-batches-per-drain:16}") int maxBatchesPerDrain,
            @Value("${app.outbox.e2ee-maintenance.retry-delay-ms:3000}") long retryDelayMs
    ) {
        this.e2eeMaintenanceOutboxRepository = e2eeMaintenanceOutboxRepository;
        this.chatRoomRepository = chatRoomRepository;
        this.userEncryptionAccountKeyRepository = userEncryptionAccountKeyRepository;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
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
            fixedDelayString = "${app.outbox.e2ee-maintenance.poll-fixed-delay-ms:1000}",
            initialDelayString = "${app.outbox.e2ee-maintenance.poll-fixed-delay-ms:1000}"
    )
    @Transactional
    public void drainScheduledEntries() {
        runDueEntriesDrain(Instant.now());
    }

    int processDueEntries(Instant now) {
        int processedCount = 0;
        for (int batchIndex = 0; batchIndex < maxBatchesPerDrain; batchIndex += 1) {
            List<E2eeMaintenanceOutboxEntry> dueEntries =
                    e2eeMaintenanceOutboxRepository.lockDueEntriesForProcessing(now, batchSize);
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

    private void processEntry(E2eeMaintenanceOutboxEntry entry, Instant now) {
        try {
            switch (entry.getJobType()) {
                case ROTATE_CHAT_ACTIVE_HISTORY_KEY -> {
                    if (isStaleMembershipScopedRotation(entry)) {
                        break;
                    }
                    chatGroupHistoryKeyService.rotateActiveHistoryKeyForCurrentParticipants(
                            entry.getChatId(),
                            entry.getPrimaryGrantorUserId()
                    );
                }
                case BACKFILL_CHAT_HISTORY_ACCESS ->
                        chatGroupHistoryKeyService.backfillHistoryAccessFromEscrow(
                                entry.getChatId(),
                                entry.getRecipientUserId() == null ? Set.of() : Set.of(entry.getRecipientUserId()),
                                entry.getPrimaryGrantorUserId()
                        );
                case REFRESH_VISIBLE_HISTORY_ACCESS -> {
                    if (isStaleRecipientAccountKeyRefresh(entry)) {
                        break;
                    }
                    chatGroupHistoryKeyService.refreshVisibleHistoryAccessForRecipient(entry.getRecipientUserId());
                }
            }
            entry.markProcessed(now);
        } catch (RuntimeException exception) {
            Instant nextAttemptAt = now.plusMillis(nextRetryDelayMs(entry));
            entry.markFailed(nextAttemptAt, exception.getMessage());
            LOGGER.warn(
                    "E2EE maintenance outbox processing failed for entry {} jobType={} chatId={} recipientUserId={}",
                    entry.getId(),
                    entry.getJobType(),
                    entry.getChatId(),
                    entry.getRecipientUserId(),
                    exception
            );
        }
        e2eeMaintenanceOutboxRepository.save(entry);
    }

    private void runDueEntriesDrain(Instant now) {
        clusterJobLockService.runIfLockAcquired(
                E2EE_MAINTENANCE_OUTBOX_LOCK_ID,
                () -> processDueEntries(now)
        );
    }

    private boolean isStaleMembershipScopedRotation(E2eeMaintenanceOutboxEntry entry) {
        Long expectedMembershipVersion = entry.getChatMembershipVersion();
        if (entry.getChatId() == null || expectedMembershipVersion == null) {
            return false;
        }

        return chatRoomRepository.findMembershipVersionByChatId(entry.getChatId())
                .map(currentMembershipVersion -> currentMembershipVersion.longValue() != expectedMembershipVersion.longValue())
                .orElse(true);
    }

    private boolean isStaleRecipientAccountKeyRefresh(E2eeMaintenanceOutboxEntry entry) {
        Long expectedAccountKeyVersion = entry.getRecipientAccountKeyVersion();
        if (entry.getRecipientUserId() == null || expectedAccountKeyVersion == null) {
            return false;
        }

        return userEncryptionAccountKeyRepository.findAccountKeyVersionByUserId(entry.getRecipientUserId())
                .map(currentAccountKeyVersion -> currentAccountKeyVersion.longValue() != expectedAccountKeyVersion.longValue())
                .orElse(true);
    }

    private long nextRetryDelayMs(E2eeMaintenanceOutboxEntry entry) {
        long multiplier = Math.min(8L, Math.max(1L, (long) entry.getAttemptCount() + 1L));
        return retryDelayMs * multiplier;
    }
}
