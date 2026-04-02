package com.north.messenger.application.message;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MessageDispatchEventListener {

    private final MessageService messageService;

    public MessageDispatchEventListener(MessageService messageService) {
        this.messageService = messageService;
    }

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageDispatch(MessageDispatchEvent event) {
        messageService.dispatchMessage(event);
    }
}
