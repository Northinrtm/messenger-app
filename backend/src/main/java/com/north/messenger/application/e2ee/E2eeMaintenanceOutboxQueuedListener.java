package com.north.messenger.application.e2ee;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class E2eeMaintenanceOutboxQueuedListener {

    private final E2eeMaintenanceOutboxProcessor e2eeMaintenanceOutboxProcessor;
    private final AtomicBoolean drainRunning = new AtomicBoolean(false);
    private final AtomicBoolean drainRequested = new AtomicBoolean(false);

    public E2eeMaintenanceOutboxQueuedListener(E2eeMaintenanceOutboxProcessor e2eeMaintenanceOutboxProcessor) {
        this.e2eeMaintenanceOutboxProcessor = e2eeMaintenanceOutboxProcessor;
    }

    @Async("e2eeMaintenanceExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onQueued(E2eeMaintenanceOutboxQueuedEvent event) {
        requestDrain();
    }

    private void requestDrain() {
        drainRequested.set(true);
        if (!drainRunning.compareAndSet(false, true)) {
            return;
        }

        while (true) {
            try {
                do {
                    drainRequested.set(false);
                    e2eeMaintenanceOutboxProcessor.drainAvailableEntries();
                } while (drainRequested.get());
            } finally {
                drainRunning.set(false);
            }

            if (!drainRequested.get() || !drainRunning.compareAndSet(false, true)) {
                return;
            }
        }
    }
}
