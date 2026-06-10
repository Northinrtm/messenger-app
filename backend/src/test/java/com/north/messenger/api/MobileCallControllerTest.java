package com.north.messenger.api;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.north.messenger.api.MobileCallController.CallRingRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.call.TurnCredentialService;
import com.north.messenger.application.push.PushNotificationDeliveryService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.security.AuthRateLimitDecision;
import com.north.messenger.security.AuthRateLimiter;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

class MobileCallControllerTest {

    private AuthService authService;
    private PushNotificationDeliveryService pushNotificationDeliveryService;
    private AuthRateLimiter rateLimiter;
    private MobileCallController controller;
    private Authentication authentication;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        pushNotificationDeliveryService = mock(PushNotificationDeliveryService.class);
        rateLimiter = mock(AuthRateLimiter.class);
        controller = new MobileCallController(
                authService,
                pushNotificationDeliveryService,
                mock(TurnCredentialService.class),
                rateLimiter);
        authentication = mock(Authentication.class);
        when(authentication.getName()).thenReturn("alice");
        when(rateLimiter.acquire(any(), any(), any(), anyLong()))
                .thenReturn(new AuthRateLimitDecision(true, 0));
    }

    @Test
    void ringResolvesTargetAndSendsPush() {
        UUID bobId = UUID.randomUUID();
        UserAccount bob = mock(UserAccount.class);
        when(bob.getId()).thenReturn(bobId);
        when(authService.requireExistingUser("bob")).thenReturn(bob);

        controller.ring(authentication, new CallRingRequest("bob", "call-1", "Alice A"));

        verify(pushNotificationDeliveryService).notifyIncomingWebRtcCall(eq(bobId), eq("call-1"), eq("Alice A"));
    }

    @Test
    void ringRejectedWhenRateLimited() {
        when(rateLimiter.acquire(any(), any(), any(), anyLong()))
                .thenReturn(new AuthRateLimitDecision(false, 30));

        assertThatThrownBy(() ->
                controller.ring(authentication, new CallRingRequest("bob", "call-1", "Alice A")))
                .isInstanceOf(ResponseStatusException.class);

        verifyNoInteractions(pushNotificationDeliveryService);
    }
}
