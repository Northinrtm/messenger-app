package com.north.messenger.application.push;

import com.north.messenger.api.dto.PushSubscriptionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserPushSubscription;
import com.north.messenger.domain.repository.UserPushSubscriptionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PushSubscriptionServiceTest {

    private AuthService authService;
    private UserPushSubscriptionRepository pushSubscriptionRepository;
    private PushSubscriptionService pushSubscriptionService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        PushVapidKeyService vapidKeyService = mock(PushVapidKeyService.class);
        pushSubscriptionRepository = mock(UserPushSubscriptionRepository.class);
        pushSubscriptionService = new PushSubscriptionService(
                authService,
                new PushNotificationProperties(
                        true,
                        "mailto:no-reply@example.test",
                        "",
                        "",
                        Duration.ofSeconds(5),
                        Duration.ofMinutes(1)
                ),
                vapidKeyService,
                pushSubscriptionRepository
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(testUserAccount(
                UUID.fromString("11111111-1111-1111-1111-111111111111"),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-21T12:00:00Z")
        ));
        when(pushSubscriptionRepository.save(any(UserPushSubscription.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void upsertSubscriptionShouldStoreHttpsEndpoint() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/test-subscription";
        when(pushSubscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.empty());

        pushSubscriptionService.upsertSubscription("north", request(endpoint), "Mozilla/5.0");

        ArgumentCaptor<UserPushSubscription> captor =
                ArgumentCaptor.forClass(UserPushSubscription.class);
        verify(pushSubscriptionRepository).save(captor.capture());
        assertThat(captor.getValue().getEndpoint()).isEqualTo(endpoint);
        assertThat(captor.getValue().getUserAgent()).isEqualTo("Mozilla/5.0");
    }

    @Test
    void upsertSubscriptionShouldRejectUnsafeEndpoints() {
        for (String endpoint : List.of(
                "http://fcm.googleapis.com/fcm/send/test-subscription",
                "https://localhost/push",
                "https://127.0.0.1/push",
                "https://10.0.0.8/push",
                "https://[::1]/push"
        )) {
            assertThatThrownBy(() -> pushSubscriptionService.upsertSubscription("north", request(endpoint), null))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        verify(pushSubscriptionRepository, never()).save(any(UserPushSubscription.class));
    }

    private static PushSubscriptionRequest request(String endpoint) {
        return new PushSubscriptionRequest(
                endpoint,
                null,
                new PushSubscriptionRequest.PushSubscriptionKeys("p256dh-key", "auth-key")
        );
    }
}
