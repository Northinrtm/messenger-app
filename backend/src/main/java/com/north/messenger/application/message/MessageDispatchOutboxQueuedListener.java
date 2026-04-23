package com.north.messenger.application.message;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MessageDispatchOutboxQueuedListener {

    private final MessageDispatchOutboxProcessor messageDispatchOutboxProcessor;

    public MessageDispatchOutboxQueuedListener(MessageDispatchOutboxProcessor messageDispatchOutboxProcessor) {
        this.messageDispatchOutboxProcessor = messageDispatchOutboxProcessor;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onQueued(MessageDispatchOutboxQueuedEvent event) {
        messageDispatchOutboxProcessor.drainAvailableEntries();
    }
}
