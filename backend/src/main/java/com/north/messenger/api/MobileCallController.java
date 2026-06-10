package com.north.messenger.api;

import com.north.messenger.api.dto.IceServersResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.call.TurnCredentialService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.security.AuthRateLimitDecision;
import com.north.messenger.security.AuthRateLimitPolicy;
import com.north.messenger.security.AuthRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Backs the native 1-on-1 call "ring" push. A caller hits this once when starting
 * a call so the callee's device is woken even when the app is backgrounded/closed;
 * the live SDP offer is then delivered over the realtime signaling channel.
 */
@RestController
@RequestMapping("/api/mobile/calls")
@Tag(name = "Mobile calls", description = "Native WebRTC call wake-up pushes for the mobile client")
public class MobileCallController {

    private static final AuthRateLimitPolicy CALL_RING_POLICY =
            new AuthRateLimitPolicy(30, Duration.ofMinutes(1));

    private final AuthService authService;
    private final PushNotificationDeliveryService pushNotificationDeliveryService;
    private final TurnCredentialService turnCredentialService;
    private final AuthRateLimiter rateLimiter;

    public MobileCallController(
            AuthService authService,
            PushNotificationDeliveryService pushNotificationDeliveryService,
            TurnCredentialService turnCredentialService,
            AuthRateLimiter rateLimiter
    ) {
        this.authService = authService;
        this.pushNotificationDeliveryService = pushNotificationDeliveryService;
        this.turnCredentialService = turnCredentialService;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/ice-servers")
    @Operation(summary = "Get STUN/TURN ICE servers (with ephemeral TURN credentials) for a native call")
    public IceServersResponse iceServers(Authentication authentication) {
        return turnCredentialService.resolveIceServers(authentication.getName());
    }

    @PostMapping("/ring")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Send an incoming-call wake-up push to the callee's devices")
    public void ring(Authentication authentication, @Valid @RequestBody CallRingRequest request) {
        AuthRateLimitDecision decision = rateLimiter.acquire(
                "/api/mobile/calls/ring",
                authentication.getName(),
                CALL_RING_POLICY,
                System.currentTimeMillis()
        );
        if (!decision.allowed()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many call attempts");
        }

        UserAccount target = authService.requireExistingUser(request.targetUsername());
        pushNotificationDeliveryService.notifyIncomingWebRtcCall(
                target.getId(),
                request.callId(),
                request.callerDisplayName()
        );
    }

    public record CallRingRequest(
            @NotBlank @Size(max = 64) String targetUsername,
            @NotBlank @Size(max = 100) String callId,
            @Size(max = 120) String callerDisplayName
    ) {
    }
}
