package com.north.messenger.application.message;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MessageDispatchEventListener {

    private final MessageDispatchService messageDispatchService;

    public MessageDispatchEventListener(MessageDispatchService messageDispatchService) {
        this.messageDispatchService = messageDispatchService;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageDispatch(MessageDispatchEvent event) {
        messageDispatchService.dispatchMessage(event);
    }
}
