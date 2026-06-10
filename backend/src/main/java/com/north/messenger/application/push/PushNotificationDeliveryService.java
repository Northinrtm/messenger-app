package com.north.messenger.application.push;

import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserPushSubscription;
import com.north.messenger.domain.repository.DevicePushTokenRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserPushSubscriptionRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationDeliveryService.class);
    private static final int MAX_PUSH_RETRIES = 3;
    private static final long[] PUSH_RETRY_DELAYS_MS = {1_000L, 2_000L, 4_000L};

    private final PushNotificationProperties properties;
    private final PushVapidKeyService vapidKeyService;
    private final UserPushSubscriptionRepository pushSubscriptionRepository;
    private final DevicePushTokenRepository devicePushTokenRepository;
    private final MessageReceiptRepository messageReceiptRepository;
    private final Optional<FcmDeliveryService> fcmDeliveryService;
    private final HttpClient httpClient;

    public PushNotificationDeliveryService(
            PushNotificationProperties properties,
            PushVapidKeyService vapidKeyService,
            UserPushSubscriptionRepository pushSubscriptionRepository,
            DevicePushTokenRepository devicePushTokenRepository,
            MessageReceiptRepository messageReceiptRepository,
            Optional<FcmDeliveryService> fcmDeliveryService
    ) {
        this.properties = properties;
        this.vapidKeyService = vapidKeyService;
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.devicePushTokenRepository = devicePushTokenRepository;
        this.messageReceiptRepository = messageReceiptRepository;
        this.fcmDeliveryService = fcmDeliveryService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(properties.requestTimeout())
                .build();
    }

    @Async("pushNotificationExecutor")
    @Transactional
    public void notifyNewMessage(ChatMessage message, List<UserAccount> participants, UserAccount sender) {
        if (!properties.enabled() || participants.isEmpty()) {
            return;
        }

        Set<UUID> recipientIds = participants.stream()
                .map(UserAccount::getId)
                .filter(userId -> !userId.equals(sender.getId()))
                .collect(Collectors.toSet());
        if (recipientIds.isEmpty()) {
            return;
        }

        pushSubscriptionRepository.findAllByUserIdIn(recipientIds)
                .forEach(subscription -> sendGenericMessageNotification(subscription, message));

        fcmDeliveryService.ifPresent(fcm -> {
            Map<UUID, Long> unreadByUserId = new HashMap<>();
            messageReceiptRepository.countTotalUnreadByUserIdIn(recipientIds)
                    .forEach(view -> unreadByUserId.put(view.getUserId(), view.getUnreadCount()));

            devicePushTokenRepository.findAllByUserIdIn(recipientIds)
                    .forEach(deviceToken -> {
                        int unreadCount = unreadByUserId
                                .getOrDefault(deviceToken.getUserId(), 0L)
                                .intValue();
                        boolean valid = fcm.sendNewMessageNotification(
                                deviceToken.getToken(),
                                message.getChatId().toString(),
                                unreadCount
                        );
                        if (!valid) {
                            devicePushTokenRepository.deleteByToken(deviceToken.getToken());
                        }
                    });
        });
    }

    /**
     * Sends a background incoming-call push (Android/FCM) to the callees so the
     * person being called is alerted even when the app is closed or backgrounded.
     * Web clients are covered by the realtime ring while the tab is open, so this
     * intentionally targets device tokens only.
     */
    @Async("pushNotificationExecutor")
    @Transactional
    public void notifyIncomingCall(String conferenceId, List<UserAccount> callees, String callerName) {
        if (!properties.enabled() || callees.isEmpty()) {
            return;
        }

        fcmDeliveryService.ifPresent(fcm -> {
            Set<UUID> calleeIds = callees.stream()
                    .map(UserAccount::getId)
                    .collect(Collectors.toSet());
            devicePushTokenRepository.findAllByUserIdIn(calleeIds)
                    .forEach(deviceToken -> {
                        boolean valid = fcm.sendIncomingCallNotification(
                                deviceToken.getToken(),
                                conferenceId,
                                callerName
                        );
                        if (!valid) {
                            devicePushTokenRepository.deleteByToken(deviceToken.getToken());
                        }
                    });
        });
    }

    private void sendGenericMessageNotification(UserPushSubscription subscription, ChatMessage message) {
        if (subscription.getExpirationTime() != null
                && subscription.getExpirationTime().isBefore(Instant.now())) {
            pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
            log.debug("Skipped expired push subscription chatId={}", message.getChatId());
            return;
        }

        for (int attempt = 0; attempt < MAX_PUSH_RETRIES; attempt++) {
            if (attempt > 0) {
                try {
                    Thread.sleep(PUSH_RETRY_DELAYS_MS[attempt - 1]);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(subscription.getEndpoint()))
                        .timeout(properties.requestTimeout())
                        .header("TTL", String.valueOf(properties.ttl().toSeconds()))
                        .header("Urgency", "normal")
                        .header("Content-Length", "0")
                        .header("Authorization", vapidKeyService.authorizationHeader(subscription.getEndpoint()))
                        .POST(HttpRequest.BodyPublishers.ofByteArray(new byte[0]))
                        .build();
                HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());

                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    return;
                }
                if (response.statusCode() == 404 || response.statusCode() == 410) {
                    pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
                    return;
                }
                if (response.statusCode() == 403 && isFcmEndpoint(subscription.getEndpoint())) {
                    pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
                    log.warn("Push subscription removed after FCM 403 chatId={} messageId={}",
                            message.getChatId(), message.getId());
                    return;
                }
                if (response.statusCode() == 411 || response.statusCode() == 429 || response.statusCode() >= 500) {
                    log.warn("Push transient error attempt={}/{} status={} chatId={} messageId={}",
                            attempt + 1, MAX_PUSH_RETRIES, response.statusCode(),
                            message.getChatId(), message.getId());
                    continue;
                }
                log.warn("Push rejected status={} chatId={} messageId={}",
                        response.statusCode(), message.getChatId(), message.getId());
                return;

            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception exception) {
                log.warn("Push send error attempt={}/{} chatId={} messageId={}: {}",
                        attempt + 1, MAX_PUSH_RETRIES,
                        message.getChatId(), message.getId(), exception.getMessage());
            }
        }
        log.warn("Push notification failed after {} attempts chatId={} messageId={}",
                MAX_PUSH_RETRIES, message.getChatId(), message.getId());
    }

    private boolean isFcmEndpoint(String endpoint) {
        try {
            String host = URI.create(endpoint).getHost();
            return "fcm.googleapis.com".equalsIgnoreCase(host) || "android.googleapis.com".equalsIgnoreCase(host);
        } catch (RuntimeException exception) {
            return false;
        }
    }
}
