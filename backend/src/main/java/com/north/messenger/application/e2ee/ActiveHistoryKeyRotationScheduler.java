package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.repository.ChatRoomRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class ActiveHistoryKeyRotationScheduler {

    private static final long ACTIVE_HISTORY_KEY_ROTATION_LOCK_ID = 7_101_005L;

    private final ChatRoomRepository chatRoomRepository;
    private final E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService;
    private final ClusterJobLockService clusterJobLockService;
    private final boolean enabled;
    private final Duration maxAge;
    private final int batchSize;

    ActiveHistoryKeyRotationScheduler(
            ChatRoomRepository chatRoomRepository,
            E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService,
            ClusterJobLockService clusterJobLockService,
            @Value("${app.e2ee.active-history-key-rotation.enabled:true}") boolean enabled,
            @Value("${app.e2ee.active-history-key-rotation.max-age:P30D}") Duration maxAge,
            @Value("${app.e2ee.active-history-key-rotation.batch-size:128}") int batchSize
    ) {
        this.chatRoomRepository = chatRoomRepository;
        this.e2eeMaintenanceOutboxService = e2eeMaintenanceOutboxService;
        this.clusterJobLockService = clusterJobLockService;
        this.enabled = enabled;
        this.maxAge = maxAge == null ? Duration.ofDays(30) : maxAge;
        this.batchSize = Math.max(1, batchSize);
    }

    @Scheduled(
            fixedDelayString = "${app.e2ee.active-history-key-rotation.scan-fixed-delay-ms:3600000}",
            initialDelayString = "${app.e2ee.active-history-key-rotation.scan-fixed-delay-ms:3600000}"
    )
    @Transactional
    public void enqueuePeriodicRotations() {
        if (!enabled || maxAge.isZero() || maxAge.isNegative()) {
            return;
        }

        clusterJobLockService.runIfLockAcquired(
                ACTIVE_HISTORY_KEY_ROTATION_LOCK_ID,
                this::enqueueDueRooms
        );
    }

    private void enqueueDueRooms() {
        Instant cutoff = Instant.now().minus(maxAge);
        List<ChatRoom> dueRooms = chatRoomRepository.findRoomsWithActiveHistoryKeyCreatedBefore(cutoff, batchSize);
        for (ChatRoom room : dueRooms) {
            UUID grantorUserId = resolveGrantorUserId(room);
            if (grantorUserId == null) {
                continue;
            }
            e2eeMaintenanceOutboxService.enqueueRotation(room.getId(), grantorUserId);
        }
    }

    private UUID resolveGrantorUserId(ChatRoom room) {
        if (room == null) {
            return null;
        }
        if (room.getOwnerUserId() != null) {
            return room.getOwnerUserId();
        }
        if (room.isDirect()) {
            if (room.getDirectUserLowId() != null) {
                return room.getDirectUserLowId();
            }
            return room.getDirectUserHighId();
        }
        return null;
    }
}
