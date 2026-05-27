package com.north.messenger.api;

import com.north.messenger.application.push.DevicePushTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mobile/push")
@Tag(name = "Mobile push tokens", description = "Register and unregister FCM device push tokens for the mobile client")
public class MobilePushTokenController {

    private final DevicePushTokenService devicePushTokenService;

    public MobilePushTokenController(DevicePushTokenService devicePushTokenService) {
        this.devicePushTokenService = devicePushTokenService;
    }

    @PostMapping("/token")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Register a device push token",
            description = "Registers an FCM device token for the authenticated user. If the token already exists for a different user, it is re-associated with the current user."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Token registered successfully"),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void registerToken(
            Authentication authentication,
            @Valid @RequestBody RegisterDevicePushTokenRequest request
    ) {
        devicePushTokenService.registerToken(authentication.getName(), request.token(), request.platform());
    }

    @DeleteMapping("/token")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Unregister a device push token",
            description = "Removes the device push token for the authenticated user. Call on logout."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Token unregistered successfully"),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void unregisterToken(
            Authentication authentication,
            @Valid @RequestBody UnregisterDevicePushTokenRequest request
    ) {
        devicePushTokenService.unregisterToken(authentication.getName(), request.token());
    }

    public record RegisterDevicePushTokenRequest(
            @NotBlank @Size(max = 512) String token,
            @NotBlank @Pattern(regexp = "ANDROID|IOS") String platform
    ) {
    }

    public record UnregisterDevicePushTokenRequest(
            @NotBlank @Size(max = 512) String token
    ) {
    }
}
