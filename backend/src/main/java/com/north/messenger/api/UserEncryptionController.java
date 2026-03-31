package com.north.messenger.api;

import com.north.messenger.api.dto.ResolveEncryptionKeysRequest;
import com.north.messenger.api.dto.UserEncryptionKeyBundleRequest;
import com.north.messenger.api.dto.UserEncryptionKeyBundleResponse;
import com.north.messenger.api.dto.UserEncryptionPublicKeyResponse;
import com.north.messenger.application.e2ee.UserEncryptionKeyService;
import jakarta.validation.Valid;
import java.util.List;
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

    private final UserEncryptionKeyService userEncryptionKeyService;

    public UserEncryptionController(UserEncryptionKeyService userEncryptionKeyService) {
        this.userEncryptionKeyService = userEncryptionKeyService;
    }

    @GetMapping("/me")
    public UserEncryptionKeyBundleResponse me(Authentication authentication) {
        return userEncryptionKeyService.getOwnBundle(authentication.getName());
    }

    @PutMapping("/me")
    public UserEncryptionKeyBundleResponse upsertOwnBundle(
            Authentication authentication,
            @Valid @RequestBody UserEncryptionKeyBundleRequest request
    ) {
        return userEncryptionKeyService.upsertOwnBundle(authentication.getName(), request);
    }

    @PostMapping("/keys/resolve")
    public List<UserEncryptionPublicKeyResponse> resolveKeys(
            Authentication authentication,
            @Valid @RequestBody ResolveEncryptionKeysRequest request
    ) {
        return userEncryptionKeyService.resolvePublicKeys(authentication.getName(), request);
    }
}
