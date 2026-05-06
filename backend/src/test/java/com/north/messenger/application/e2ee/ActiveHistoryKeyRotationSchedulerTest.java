package com.north.messenger.application.e2ee;

import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.repository.ChatRoomRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ActiveHistoryKeyRotationSchedulerTest {

    private ChatRoomRepository chatRoomRepository;
    private E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService;
    private ClusterJobLockService clusterJobLockService;

    @BeforeEach
    void setUp() {
        chatRoomRepository = mock(ChatRoomRepository.class);
        e2eeMaintenanceOutboxService = mock(E2eeMaintenanceOutboxService.class);
        clusterJobLockService = mock(ClusterJobLockService.class);
        doAnswer(invocation -> {
            Runnable runnable = invocation.getArgument(1);
            runnable.run();
            return true;
        }).when(clusterJobLockService).runIfLockAcquired(any(Long.class), any(Runnable.class));
    }

    @Test
    void enqueuePeriodicRotationsShouldQueueStaleGroupAndDirectChats() {
        UUID groupChatId = UUID.randomUUID();
        UUID groupOwnerId = UUID.randomUUID();
        UUID directChatId = UUID.randomUUID();
        UUID directFirstUserId = UUID.randomUUID();
        UUID directSecondUserId = UUID.randomUUID();
        ChatRoom groupRoom = new ChatRoom(groupChatId, "Group", false, Instant.parse("2026-01-01T00:00:00Z"));
        groupRoom.updateOwnerUserId(groupOwnerId);
        ChatRoom directRoom = new ChatRoom(
                directChatId,
                "Direct",
                true,
                Instant.parse("2026-01-01T00:00:00Z"),
                directFirstUserId,
                directSecondUserId
        );

        when(chatRoomRepository.findRoomsWithActiveHistoryKeyCreatedBefore(any(), eq(64)))
                .thenReturn(List.of(groupRoom, directRoom));

        ActiveHistoryKeyRotationScheduler scheduler = new ActiveHistoryKeyRotationScheduler(
                chatRoomRepository,
                e2eeMaintenanceOutboxService,
                clusterJobLockService,
                true,
                Duration.ofDays(30),
                64
        );

        scheduler.enqueuePeriodicRotations();

        verify(chatRoomRepository).findRoomsWithActiveHistoryKeyCreatedBefore(any(), eq(64));
        verify(e2eeMaintenanceOutboxService).enqueueRotation(groupChatId, groupOwnerId);
        verify(e2eeMaintenanceOutboxService).enqueueRotation(directChatId, directRoom.getDirectUserLowId());
    }

    @Test
    void enqueuePeriodicRotationsShouldSkipWhenDisabled() {
        ActiveHistoryKeyRotationScheduler scheduler = new ActiveHistoryKeyRotationScheduler(
                chatRoomRepository,
                e2eeMaintenanceOutboxService,
                clusterJobLockService,
                false,
                Duration.ofDays(30),
                64
        );

        scheduler.enqueuePeriodicRotations();

        verify(clusterJobLockService, never()).runIfLockAcquired(any(Long.class), any(Runnable.class));
        verify(chatRoomRepository, never()).findRoomsWithActiveHistoryKeyCreatedBefore(any(), any(Integer.class));
        verify(e2eeMaintenanceOutboxService, never()).enqueueRotation(any(), any());
    }
}
