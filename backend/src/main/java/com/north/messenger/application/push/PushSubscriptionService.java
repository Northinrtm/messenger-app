package com.north.messenger.application.push;

import com.north.messenger.api.dto.DeletePushSubscriptionRequest;
import com.north.messenger.api.dto.PushNotificationConfigResponse;
import com.north.messenger.api.dto.PushSubscriptionRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserPushSubscription;
import com.north.messenger.domain.repository.UserPushSubscriptionRepository;
import java.net.InetAddress;
import java.net.URI;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class PushSubscriptionService {

    private final AuthService authService;
    private final PushNotificationProperties properties;
    private final PushVapidKeyService vapidKeyService;
    private final UserPushSubscriptionRepository pushSubscriptionRepository;

    public PushSubscriptionService(
            AuthService authService,
            PushNotificationProperties properties,
            PushVapidKeyService vapidKeyService,
            UserPushSubscriptionRepository pushSubscriptionRepository
    ) {
        this.authService = authService;
        this.properties = properties;
        this.vapidKeyService = vapidKeyService;
        this.pushSubscriptionRepository = pushSubscriptionRepository;
    }

    public PushNotificationConfigResponse getConfig() {
        return new PushNotificationConfigResponse(properties.enabled(), vapidKeyService.publicKey());
    }

    @Transactional
    public void upsertSubscription(String username, PushSubscriptionRequest request, String userAgent) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        String endpoint = validateEndpoint(request.endpoint());
        Instant now = Instant.now();
        String normalizedUserAgent = truncate(userAgent, 512);
        pushSubscriptionRepository.findByEndpoint(endpoint)
                .ifPresentOrElse(
                        subscription -> {
                            subscription.update(
                                    currentUser.getId(),
                                    request.keys().p256dh(),
                                    request.keys().auth(),
                                    request.expirationTime(),
                                    normalizedUserAgent,
                                    now
                            );
                            pushSubscriptionRepository.save(subscription);
                        },
                        () -> pushSubscriptionRepository.save(new UserPushSubscription(
                                UUID.randomUUID(),
                                currentUser.getId(),
                                endpoint,
                                request.keys().p256dh(),
                                request.keys().auth(),
                                request.expirationTime(),
                                normalizedUserAgent,
                                now
                        ))
                );
    }

    @Transactional
    public void deleteSubscription(String username, DeletePushSubscriptionRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        pushSubscriptionRepository.deleteByEndpointAndUserId(request.endpoint(), currentUser.getId());
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private static String validateEndpoint(String endpoint) {
        try {
            URI uri = URI.create(endpoint.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || host.isBlank()) {
                throw new IllegalArgumentException("Push endpoint must be an https URL");
            }

            String normalizedHost = host.toLowerCase(Locale.ROOT);
            if (
                    normalizedHost.equals("localhost") ||
                    normalizedHost.endsWith(".localhost") ||
                    isUnsafeIpLiteral(normalizedHost)
            ) {
                throw new IllegalArgumentException("Push endpoint host is not allowed");
            }

            return uri.toString();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid push subscription endpoint");
        }
    }

    private static boolean isUnsafeIpLiteral(String host) {
        String normalizedHost = host;
        if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
            normalizedHost = normalizedHost.substring(1, normalizedHost.length() - 1);
        }
        if (!normalizedHost.contains(":") && !normalizedHost.matches("\\d+(\\.\\d+){3}")) {
            return false;
        }

        try {
            InetAddress address = InetAddress.getByName(normalizedHost);
            byte[] rawAddress = address.getAddress();
            boolean uniqueLocalIpv6 =
                    rawAddress.length == 16 && (rawAddress[0] & 0xfe) == 0xfc;
            return address.isAnyLocalAddress() ||
                    address.isLoopbackAddress() ||
                    address.isLinkLocalAddress() ||
                    address.isSiteLocalAddress() ||
                    address.isMulticastAddress() ||
                    uniqueLocalIpv6;
        } catch (Exception exception) {
            return true;
        }
    }
}
