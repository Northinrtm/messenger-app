package com.north.messenger.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.north.messenger.api.dto.CallSignalEvent;
import com.north.messenger.api.dto.CallSignalRequest;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.security.AuthRateLimitDecision;
import com.north.messenger.security.AuthRateLimiter;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.security.Principal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class CallSignalingControllerTest {

    private final Principal alice = () -> "alice";

    private RealtimeMessagingGateway gateway;
    private AuthRateLimiter rateLimiter;
    private ValidatorFactory validatorFactory;
    private CallSignalingController controller;

    @BeforeEach
    void setUp() {
        gateway = mock(RealtimeMessagingGateway.class);
        rateLimiter = mock(AuthRateLimiter.class);
        validatorFactory = Validation.buildDefaultValidatorFactory();
        Validator validator = validatorFactory.getValidator();
        controller = new CallSignalingController(gateway, validator, rateLimiter);
        when(rateLimiter.acquire(any(), any(), any(), anyLong()))
                .thenReturn(new AuthRateLimitDecision(true, 0));
    }

    @AfterEach
    void tearDown() {
        validatorFactory.close();
    }

    @Test
    void relaysSignalToTargetStampingSender() {
        CallSignalRequest request =
                new CallSignalRequest("call-1", "bob", "OFFER", "sdp-data", null, "Alice A");

        controller.signal(alice, request);

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(gateway).sendToUser(eq("bob"), eq("/queue/call-signal"), captor.capture());
        CallSignalEvent event = captor.getValue();
        assertThat(event.fromUsername()).isEqualTo("alice");
        assertThat(event.type()).isEqualTo("OFFER");
        assertThat(event.callId()).isEqualTo("call-1");
        assertThat(event.callerDisplayName()).isEqualTo("Alice A");
    }

    @Test
    void lowercasesTargetUsername() {
        controller.signal(alice, new CallSignalRequest("call-1", "BoB", "ICE", null, "cand", null));

        verify(gateway).sendToUser(eq("bob"), eq("/queue/call-signal"), any(CallSignalEvent.class));
    }

    @Test
    void ignoresSelfCall() {
        controller.signal(alice, new CallSignalRequest("call-1", "alice", "OFFER", "sdp", null, null));

        verifyNoInteractions(gateway);
    }

    @Test
    void ignoresInvalidRequest() {
        controller.signal(alice, new CallSignalRequest("", "bob", "OFFER", null, null, null));

        verifyNoInteractions(gateway);
    }

    @Test
    void ignoresWhenRateLimited() {
        when(rateLimiter.acquire(any(), any(), any(), anyLong()))
                .thenReturn(new AuthRateLimitDecision(false, 30));

        controller.signal(alice, new CallSignalRequest("call-1", "bob", "OFFER", "sdp", null, null));

        verifyNoInteractions(gateway);
    }
}
