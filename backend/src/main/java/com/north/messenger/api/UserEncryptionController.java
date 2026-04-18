package com.north.messenger.api;

import com.north.messenger.api.dto.ResolveEncryptionDeviceBundlesRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceBundleResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceResponse;
import com.north.messenger.application.e2ee.UserEncryptionDeviceService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/e2ee")
public class UserEncryptionController {

    private final UserEncryptionDeviceService userEncryptionDeviceService;

    public UserEncryptionController(UserEncryptionDeviceService userEncryptionDeviceService) {
        this.userEncryptionDeviceService = userEncryptionDeviceService;
    }

    @GetMapping("/devices/me")
    public List<UserEncryptionDeviceResponse> listOwnDevices(Authentication authentication) {
        return userEncryptionDeviceService.listOwnDevices(authentication.getName());
    }

    @PutMapping("/devices/me")
    public UserEncryptionDeviceResponse upsertOwnDevice(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody UserEncryptionDeviceRequest request
    ) {
        return userEncryptionDeviceService.upsertOwnDevice(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @PostMapping("/devices/bundles/resolve")
    public List<UserEncryptionDeviceBundleResponse> resolveDeviceBundles(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody ResolveEncryptionDeviceBundlesRequest request
    ) {
        return userEncryptionDeviceService.resolveDeviceBundles(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "Bearer token is required"
            );
        }
        return authorization.substring(7);
    }
}
