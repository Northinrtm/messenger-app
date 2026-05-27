package com.north.messenger.application.push;

import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserPushSubscription;
import com.north.messenger.domain.repository.DevicePushTokenRepository;
import com.north.messenger.domain.repository.UserPushSubscriptionRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
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

    private final PushNotificationProperties properties;
    private final PushVapidKeyService vapidKeyService;
    private final UserPushSubscriptionRepository pushSubscriptionRepository;
    private final DevicePushTokenRepository devicePushTokenRepository;
    private final Optional<FcmDeliveryService> fcmDeliveryService;
    private final HttpClient httpClient;

    public PushNotificationDeliveryService(
            PushNotificationProperties properties,
            PushVapidKeyService vapidKeyService,
            UserPushSubscriptionRepository pushSubscriptionRepository,
            DevicePushTokenRepository devicePushTokenRepository,
            Optional<FcmDeliveryService> fcmDeliveryService
    ) {
        this.properties = properties;
        this.vapidKeyService = vapidKeyService;
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.devicePushTokenRepository = devicePushTokenRepository;
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

        fcmDeliveryService.ifPresent(fcm ->
                devicePushTokenRepository.findAllByUserIdIn(recipientIds)
                        .forEach(deviceToken -> {
                            boolean valid = fcm.sendNewMessageNotification(
                                    deviceToken.getToken(),
                                    message.getChatId().toString()
                            );
                            if (!valid) {
                                devicePushTokenRepository.deleteByToken(deviceToken.getToken());
                            }
                        })
        );
    }

    private void sendGenericMessageNotification(UserPushSubscription subscription, ChatMessage message) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(subscription.getEndpoint()))
                    .timeout(properties.requestTimeout())
                    .header("TTL", String.valueOf(properties.ttl().toSeconds()))
                    .header("Urgency", "normal")
                    .header("Authorization", vapidKeyService.authorizationHeader(subscription.getEndpoint()))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() == 404 || response.statusCode() == 410) {
                pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
                return;
            }
            if (response.statusCode() == 403 && isFcmEndpoint(subscription.getEndpoint())) {
                pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
                log.warn(
                        "Push notification subscription removed after FCM 403 chatId={} messageId={}",
                        message.getChatId(),
                        message.getId()
                );
                return;
            }
            if (response.statusCode() >= 400) {
                log.warn(
                        "Push notification rejected endpointStatus={} chatId={} messageId={}",
                        response.statusCode(),
                        message.getChatId(),
                        message.getId()
                );
            }
        } catch (Exception exception) {
            log.warn(
                    "Failed to send push notification chatId={} messageId={}: {}",
                    message.getChatId(),
                    message.getId(),
                    exception.getMessage()
            );
        }
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
