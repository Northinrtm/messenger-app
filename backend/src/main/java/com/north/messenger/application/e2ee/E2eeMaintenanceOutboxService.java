package com.north.messenger.application.e2ee;

import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.E2eeMaintenanceOutboxRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class E2eeMaintenanceOutboxService {

    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository;
    private final UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private final ApplicationEventPublisher eventPublisher;

    E2eeMaintenanceOutboxService(
            ChatRoomRepository chatRoomRepository,
            ChatParticipantRepository chatParticipantRepository,
            E2eeMaintenanceOutboxRepository e2eeMaintenanceOutboxRepository,
            UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository,
            ApplicationEventPublisher eventPublisher
    ) {
        this.chatRoomRepository = chatRoomRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.e2eeMaintenanceOutboxRepository = e2eeMaintenanceOutboxRepository;
        this.userEncryptionAccountKeyRepository = userEncryptionAccountKeyRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    void enqueueRotation(UUID chatId, UUID primaryGrantorUserId) {
        if (chatId == null) {
            return;
        }
        Long chatMembershipVersion = chatRoomRepository.findMembershipVersionByChatId(chatId).orElse(null);
        if (chatMembershipVersion == null) {
            return;
        }

        boolean queued = enqueuePendingJob(
                E2eeMaintenanceJobType.ROTATE_CHAT_ACTIVE_HISTORY_KEY,
                dedupeKeyForRotation(chatId),
                chatId,
                null,
                primaryGrantorUserId,
                chatMembershipVersion,
                null
        );
        if (queued) {
            eventPublisher.publishEvent(new E2eeMaintenanceOutboxQueuedEvent());
        }
    }

    @Transactional
    void enqueueBackfill(UUID chatId, Set<UUID> recipientUserIds, UUID primaryGrantorUserId) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        boolean queuedAny = false;
        for (UUID recipientUserId : new LinkedHashSet<>(recipientUserIds)) {
            if (recipientUserId == null) {
                continue;
            }
            queuedAny |= enqueuePendingJob(
                    E2eeMaintenanceJobType.BACKFILL_CHAT_HISTORY_ACCESS,
                    dedupeKeyForBackfill(chatId, recipientUserId),
                    chatId,
                    recipientUserId,
                    primaryGrantorUserId,
                    null,
                    null
            );
        }

        if (queuedAny) {
            eventPublisher.publishEvent(new E2eeMaintenanceOutboxQueuedEvent());
        }
    }

    @Transactional
    void enqueueRefreshVisibleHistoryAccess(UUID recipientUserId) {
        if (recipientUserId == null) {
            return;
        }
        Long recipientAccountKeyVersion = userEncryptionAccountKeyRepository
                .findAccountKeyVersionByUserId(recipientUserId)
                .orElse(null);
        if (recipientAccountKeyVersion == null) {
            return;
        }

        boolean queued = enqueuePendingJob(
                E2eeMaintenanceJobType.REFRESH_VISIBLE_HISTORY_ACCESS,
                dedupeKeyForRefresh(recipientUserId),
                null,
                recipientUserId,
                null,
                null,
                recipientAccountKeyVersion
        );
        if (queued) {
            eventPublisher.publishEvent(new E2eeMaintenanceOutboxQueuedEvent());
        }
    }

    @Transactional
    void enqueueRotationForUserChats(UUID userId) {
        if (userId == null) {
            return;
        }
        chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(userId).stream()
                .map(membership -> membership.getChatId())
                .distinct()
                .forEach(chatId -> enqueueRotation(chatId, userId));
    }

    private boolean enqueuePendingJob(
            E2eeMaintenanceJobType jobType,
            String dedupeKey,
            UUID chatId,
            UUID recipientUserId,
            UUID primaryGrantorUserId,
            Long chatMembershipVersion,
            Long recipientAccountKeyVersion
    ) {
        Instant now = Instant.now();
        E2eeMaintenanceOutboxEntry existingEntry = e2eeMaintenanceOutboxRepository
                .findByDedupeKeyAndProcessedAtIsNull(dedupeKey)
                .orElse(null);
        if (existingEntry != null) {
            existingEntry.reschedule(
                    now,
                    primaryGrantorUserId,
                    chatMembershipVersion,
                    recipientAccountKeyVersion
            );
            e2eeMaintenanceOutboxRepository.save(existingEntry);
            return true;
        }

        E2eeMaintenanceOutboxEntry nextEntry = new E2eeMaintenanceOutboxEntry(
                UUID.randomUUID(),
                jobType,
                dedupeKey,
                chatId,
                recipientUserId,
                primaryGrantorUserId,
                chatMembershipVersion,
                recipientAccountKeyVersion,
                now
        );
        try {
            e2eeMaintenanceOutboxRepository.save(nextEntry);
            return true;
        } catch (DataIntegrityViolationException exception) {
            E2eeMaintenanceOutboxEntry concurrentEntry = e2eeMaintenanceOutboxRepository
                    .findByDedupeKeyAndProcessedAtIsNull(dedupeKey)
                    .orElseThrow(() -> exception);
            concurrentEntry.reschedule(
                    now,
                    primaryGrantorUserId,
                    chatMembershipVersion,
                    recipientAccountKeyVersion
            );
            e2eeMaintenanceOutboxRepository.save(concurrentEntry);
            return true;
        }
    }

    private String dedupeKeyForRotation(UUID chatId) {
        return "rotate:" + chatId;
    }

    private String dedupeKeyForBackfill(UUID chatId, UUID recipientUserId) {
        return "backfill:" + chatId + ":" + recipientUserId;
    }

    private String dedupeKeyForRefresh(UUID recipientUserId) {
        return "refresh:" + recipientUserId;
    }
}
