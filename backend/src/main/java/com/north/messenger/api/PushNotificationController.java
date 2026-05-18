package com.north.messenger.api;

import com.north.messenger.api.dto.DeletePushSubscriptionRequest;
import com.north.messenger.api.dto.PushNotificationConfigResponse;
import com.north.messenger.api.dto.PushSubscriptionRequest;
import com.north.messenger.application.push.PushSubscriptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Push notifications", description = "Web Push configuration and subscription lifecycle")
public class PushNotificationController {

    private final PushSubscriptionService pushSubscriptionService;

    public PushNotificationController(PushSubscriptionService pushSubscriptionService) {
        this.pushSubscriptionService = pushSubscriptionService;
    }

    @GetMapping("/config")
    @Operation(
            summary = "Get Web Push public config",
            description = "Returns the public push configuration needed by browser clients to subscribe with the current VAPID key."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public PushNotificationConfigResponse getConfig() {
        return pushSubscriptionService.getConfig();
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Create or update a push subscription",
            description = "Associates the authenticated user with a browser push subscription endpoint and cryptographic keys."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
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
    @Operation(
            summary = "Delete a push subscription",
            description = "Removes one previously registered browser push subscription for the authenticated user."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void deleteSubscription(
            Authentication authentication,
            @Valid @RequestBody DeletePushSubscriptionRequest request
    ) {
        pushSubscriptionService.deleteSubscription(authentication.getName(), request);
    }
}
