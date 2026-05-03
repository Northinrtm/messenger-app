package com.north.messenger.application.e2ee;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class GroupHistoryMaintenanceListener {

    private final E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;

    public GroupHistoryMaintenanceListener(
            E2eeMaintenanceOutboxService e2eeMaintenanceOutboxService,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService
    ) {
        this.e2eeMaintenanceOutboxService = e2eeMaintenanceOutboxService;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onBackfillRequested(GroupHistoryAccessBackfillRequestedEvent event) {
        e2eeMaintenanceOutboxService.enqueueBackfill(
                event.chatId(),
                event.recipientUserIds(),
                event.primaryGrantorUserId()
        );
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRotationRequested(GroupHistoryKeyRotationRequestedEvent event) {
        e2eeMaintenanceOutboxService.enqueueRotation(
                event.chatId(),
                event.primaryGrantorUserId()
        );
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserAccountKeyChanged(UserAccountKeyChangedEvent event) {
        e2eeMaintenanceOutboxService.enqueueRefreshVisibleHistoryAccess(event.userId());
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserIdentityReset(UserIdentityResetEvent event) {
        e2eeMaintenanceOutboxService.enqueueRefreshVisibleHistoryAccess(event.userId());
        e2eeMaintenanceOutboxService.enqueueRotationForUserChats(event.userId());
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onActiveHistoryKeyBroadcastRequested(ActiveGroupHistoryKeyBroadcastRequestedEvent event) {
        chatGroupHistoryKeyService.broadcastOwnActiveHistoryKeyAccesses(
                event.chatId(),
                event.recipientUserIds()
        );
    }
}
