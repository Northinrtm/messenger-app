package com.north.messenger.api;

import com.north.messenger.api.dto.GroupHistoryKeyAccessResponse;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.api.dto.ResolveEncryptionDeviceBundlesRequest;
import com.north.messenger.api.dto.UpsertGroupHistoryKeyRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceBundleResponse;
import com.north.messenger.api.dto.UserEncryptionDeviceRequest;
import com.north.messenger.api.dto.UserEncryptionDeviceResponse;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotRequest;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotResponse;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import com.north.messenger.application.e2ee.UserEncryptionDeviceService;
import com.north.messenger.application.e2ee.UserEncryptionRecoverySnapshotService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/e2ee")
public class UserEncryptionController {

    private final UserEncryptionDeviceService userEncryptionDeviceService;
    private final UserEncryptionRecoverySnapshotService userEncryptionRecoverySnapshotService;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;

    public UserEncryptionController(
            UserEncryptionDeviceService userEncryptionDeviceService,
            UserEncryptionRecoverySnapshotService userEncryptionRecoverySnapshotService,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService
    ) {
        this.userEncryptionDeviceService = userEncryptionDeviceService;
        this.userEncryptionRecoverySnapshotService = userEncryptionRecoverySnapshotService;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
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

    @GetMapping("/recovery-snapshot/me")
    public UserEncryptionRecoverySnapshotResponse getOwnRecoverySnapshot(Authentication authentication) {
        return userEncryptionRecoverySnapshotService.getOwnRecoverySnapshot(authentication.getName());
    }

    @PutMapping("/recovery-snapshot/me")
    public UserEncryptionRecoverySnapshotResponse upsertOwnRecoverySnapshot(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody UserEncryptionRecoverySnapshotRequest request
    ) {
        return userEncryptionRecoverySnapshotService.upsertOwnRecoverySnapshot(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @GetMapping("/group-history/chats/{chatId}/keys/me")
    public List<GroupHistoryKeyAccessResponse> listOwnGroupHistoryKeys(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam String deviceId
    ) {
        return chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                authentication.getName(),
                chatId,
                deviceId
        );
    }

    @PutMapping("/group-history/chats/{chatId}/keys")
    public GroupHistoryKeyResponse upsertGroupHistoryKey(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID chatId,
            @Valid @RequestBody UpsertGroupHistoryKeyRequest request
    ) {
        return chatGroupHistoryKeyService.upsertGroupHistoryKey(
                authentication.getName(),
                extractBearerToken(authorization),
                chatId,
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
