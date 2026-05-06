package com.north.messenger.api;

import com.north.messenger.api.dto.GroupHistoryKeyAccessResponse;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.api.dto.ResolveEncryptionAccountKeysRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyRequest;
import com.north.messenger.api.dto.UserEncryptionIdentityResetRequest;
import com.north.messenger.api.dto.UserEncryptionSessionResetRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResolveResponse;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResponse;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotRequest;
import com.north.messenger.api.dto.UserEncryptionRecoverySnapshotResponse;
import com.north.messenger.application.e2ee.ChatGroupHistoryKeyService;
import com.north.messenger.application.e2ee.UserEncryptionAccountKeyService;
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

    private final UserEncryptionRecoverySnapshotService userEncryptionRecoverySnapshotService;
    private final UserEncryptionAccountKeyService userEncryptionAccountKeyService;
    private final ChatGroupHistoryKeyService chatGroupHistoryKeyService;

    public UserEncryptionController(
            UserEncryptionRecoverySnapshotService userEncryptionRecoverySnapshotService,
            UserEncryptionAccountKeyService userEncryptionAccountKeyService,
            ChatGroupHistoryKeyService chatGroupHistoryKeyService
    ) {
        this.userEncryptionRecoverySnapshotService = userEncryptionRecoverySnapshotService;
        this.userEncryptionAccountKeyService = userEncryptionAccountKeyService;
        this.chatGroupHistoryKeyService = chatGroupHistoryKeyService;
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

    @PutMapping("/account-keys/me")
    public UserEncryptionAccountKeyResponse upsertOwnAccountKey(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody UserEncryptionAccountKeyRequest request
    ) {
        return userEncryptionAccountKeyService.upsertOwnAccountKey(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @GetMapping("/account-keys/me")
    public UserEncryptionAccountKeyResponse getOwnAccountKey(Authentication authentication) {
        return userEncryptionAccountKeyService.getOwnAccountKey(authentication.getName());
    }

    @PostMapping("/account-keys/me/reset")
    public UserEncryptionAccountKeyResponse resetOwnIdentityKeyBundle(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody UserEncryptionIdentityResetRequest request
    ) {
        return userEncryptionAccountKeyService.resetOwnIdentityKeyBundle(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @PostMapping("/account-keys/me/session-reset")
    public UserEncryptionAccountKeyResponse sessionResetOwnIdentityKeyBundle(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody UserEncryptionSessionResetRequest request
    ) {
        return userEncryptionAccountKeyService.sessionResetOwnIdentityKeyBundle(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @PostMapping("/account-keys/resolve")
    public List<UserEncryptionAccountKeyResolveResponse> resolveAccountKeys(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody ResolveEncryptionAccountKeysRequest request
    ) {
        return userEncryptionAccountKeyService.resolveAccountPublicKeys(
                authentication.getName(),
                extractBearerToken(authorization),
                request
        );
    }

    @GetMapping("/group-history/chats/{chatId}/keys/me")
    public List<GroupHistoryKeyAccessResponse> listOwnGroupHistoryKeys(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(required = false) String cursor
    ) {
        return chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                authentication.getName(),
                chatId,
                cursor
        );
    }

    @GetMapping("/group-history/chats/{chatId}/active-key/me")
    public GroupHistoryKeyAccessResponse getOwnActiveGroupHistoryKey(
            Authentication authentication,
            @PathVariable UUID chatId
    ) {
        return chatGroupHistoryKeyService.getOwnActiveGroupHistoryKey(
                authentication.getName(),
                chatId
        );
    }

    @PostMapping("/group-history/chats/{chatId}/rotate")
    public GroupHistoryKeyResponse rotateOwnActiveGroupHistoryKey(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID chatId
    ) {
        return chatGroupHistoryKeyService.rotateOwnActiveHistoryKey(
                authentication.getName(),
                extractBearerToken(authorization),
                chatId
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
