package com.north.messenger.api;

import com.north.messenger.api.dto.CallSignalEvent;
import com.north.messenger.api.dto.CallSignalRequest;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.security.AuthRateLimitDecision;
import com.north.messenger.security.AuthRateLimitPolicy;
import com.north.messenger.security.AuthRateLimiter;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.security.Principal;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

/**
 * Relays native 1-on-1 WebRTC audio-call signaling (offer / answer / ICE / end)
 * between two users over STOMP. Pure pass-through: the server never stores call
 * state and stamps the authenticated sender so callers cannot be spoofed. Audio
 * flows peer-to-peer, so this carries no media — only the SDP/ICE negotiation.
 */
@Controller
public class CallSignalingController {

    private static final String CALL_SIGNAL_DESTINATION = "/queue/call-signal";
    // ICE trickle is chatty during connection setup; allow a generous per-user budget.
    private static final AuthRateLimitPolicy CALL_SIGNAL_POLICY =
            new AuthRateLimitPolicy(240, Duration.ofMinutes(1));

    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final Validator validator;
    private final AuthRateLimiter rateLimiter;

    public CallSignalingController(
            RealtimeMessagingGateway realtimeMessagingGateway,
            Validator validator,
            AuthRateLimiter rateLimiter
    ) {
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.validator = validator;
        this.rateLimiter = rateLimiter;
    }

    @MessageMapping("/calls/signal")
    public void signal(Principal principal, @Payload CallSignalRequest request) {
        if (principal == null || request == null) {
            return;
        }

        Set<ConstraintViolation<CallSignalRequest>> violations = validator.validate(request);
        if (!violations.isEmpty()) {
            return;
        }

        if (request.targetUsername().equalsIgnoreCase(principal.getName())) {
            return; // a user cannot call themselves
        }

        AuthRateLimitDecision decision = rateLimiter.acquire(
                "/ws/calls/signal",
                principal.getName(),
                CALL_SIGNAL_POLICY,
                System.currentTimeMillis()
        );
        if (!decision.allowed()) {
            return;
        }

        CallSignalEvent event = new CallSignalEvent(
                request.callId(),
                principal.getName(),
                request.type(),
                request.sdp(),
                request.candidate(),
                request.callerDisplayName()
        );
        realtimeMessagingGateway.sendToUser(
                request.targetUsername().toLowerCase(Locale.ROOT),
                CALL_SIGNAL_DESTINATION,
                event
        );
    }
}
