package com.north.messenger.application.message;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class MessageDispatchOutboxQueuedListener {

    private final MessageDispatchOutboxProcessor messageDispatchOutboxProcessor;
    private final AtomicBoolean drainRunning = new AtomicBoolean(false);
    private final AtomicBoolean drainRequested = new AtomicBoolean(false);

    public MessageDispatchOutboxQueuedListener(MessageDispatchOutboxProcessor messageDispatchOutboxProcessor) {
        this.messageDispatchOutboxProcessor = messageDispatchOutboxProcessor;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onQueued(MessageDispatchOutboxQueuedEvent event) {
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
                    messageDispatchOutboxProcessor.drainAvailableEntries();
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
