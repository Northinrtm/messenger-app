package com.north.messenger.application.message;

import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MessageLifecycleAuditListener {

    private static final Logger log = LoggerFactory.getLogger(MessageLifecycleAuditListener.class);

    @Async("messageDispatchExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageStored(MessageStoredDeferredEvent event) {
        log.info(
                "Message committed chatId={} messageId={} clientMessageId={} senderUserId={}",
                event.chatId(),
                event.messageId(),
                event.clientMessageId(),
                event.senderUserId()
        );
    }

    public static void logDeleteForSelf(UUID actorUserId, UUID chatId, List<UUID> messageIds) {
        log.info(
                "Messages deleted for self actorUserId={} chatId={} messageIds={}",
                actorUserId,
                chatId,
                messageIds
        );
    }

    public static void logDeleteForEveryone(UUID actorUserId, UUID chatId, List<UUID> messageIds) {
        log.info(
                "Messages deleted for everyone actorUserId={} chatId={} messageIds={}",
                actorUserId,
                chatId,
                messageIds
        );
    }
}
