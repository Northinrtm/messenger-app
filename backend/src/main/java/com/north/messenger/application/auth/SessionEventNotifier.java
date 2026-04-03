package com.north.messenger.application.auth;

import com.north.messenger.api.dto.SessionEventResponse;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionEventNotifier {

    private final RealtimeMessagingGateway realtimeMessagingGateway;

    public SessionEventNotifier(RealtimeMessagingGateway realtimeMessagingGateway) {
        this.realtimeMessagingGateway = realtimeMessagingGateway;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSessionRevoked(SessionRevokedEvent event) {
        realtimeMessagingGateway.sendToUser(
                event.username(),
                "/queue/sessions",
                new SessionEventResponse(SessionEventResponse.SESSION_REVOKED, event.sessionId())
        );
    }
}
