package com.north.messenger.application.auth;

import com.north.messenger.api.dto.SessionEventResponse;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionEventNotifier {

    private final SimpMessagingTemplate messagingTemplate;

    public SessionEventNotifier(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSessionRevoked(SessionRevokedEvent event) {
        messagingTemplate.convertAndSendToUser(
                event.username(),
                "/queue/sessions",
                new SessionEventResponse(SessionEventResponse.SESSION_REVOKED, event.sessionId())
        );
    }
}
