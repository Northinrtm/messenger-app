package com.north.messenger.api;

import com.north.messenger.api.dto.DeletePushSubscriptionRequest;
import com.north.messenger.api.dto.PushNotificationConfigResponse;
import com.north.messenger.api.dto.PushSubscriptionRequest;
import com.north.messenger.application.push.PushSubscriptionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/push")
public class PushNotificationController {

    private final PushSubscriptionService pushSubscriptionService;

    public PushNotificationController(PushSubscriptionService pushSubscriptionService) {
        this.pushSubscriptionService = pushSubscriptionService;
    }

    @GetMapping("/config")
    public PushNotificationConfigResponse getConfig() {
        return pushSubscriptionService.getConfig();
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void upsertSubscription(
            Authentication authentication,
            @Valid @RequestBody PushSubscriptionRequest request,
            HttpServletRequest servletRequest
    ) {
        pushSubscriptionService.upsertSubscription(
                authentication.getName(),
                request,
                servletRequest.getHeader("User-Agent")
        );
    }

    @DeleteMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSubscription(
            Authentication authentication,
            @Valid @RequestBody DeletePushSubscriptionRequest request
    ) {
        pushSubscriptionService.deleteSubscription(authentication.getName(), request);
    }
}
