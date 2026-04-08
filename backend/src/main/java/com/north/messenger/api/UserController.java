package com.north.messenger.api;

import com.north.messenger.api.dto.ContactRequest;
import com.north.messenger.application.auth.AvatarService;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AuthService authService;
    private final AvatarService avatarService;

    public UserController(AuthService authService, AvatarService avatarService) {
        this.authService = authService;
        this.avatarService = avatarService;
    }

    @GetMapping("/search")
    public List<UserProfileResponse> search(Authentication authentication, @RequestParam String query) {
        return authService.searchUsers(authentication.getName(), query);
    }

    @GetMapping("/{userId}/avatar")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID userId) {
        AvatarService.AvatarResource avatar = avatarService.loadAvatar(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Avatar not found"));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable())
                .eTag(avatar.version())
                .contentType(avatar.mediaType())
                .body(avatar.bytes());
    }

    @GetMapping("/contacts")
    public List<UserProfileResponse> listContacts(Authentication authentication) {
        return authService.listContacts(authentication.getName());
    }

    @GetMapping("/blocks")
    public List<UserProfileResponse> listBlockedUsers(Authentication authentication) {
        return authService.listBlockedUsers(authentication.getName());
    }

    @PostMapping("/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    public UserProfileResponse addContact(
            Authentication authentication,
            @Valid @RequestBody ContactRequest request
    ) {
        return authService.addContact(authentication.getName(), request.username());
    }

    @DeleteMapping("/contacts/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeContact(Authentication authentication, @PathVariable String username) {
        authService.removeContact(authentication.getName(), username);
    }

    @PostMapping("/blocks")
    @ResponseStatus(HttpStatus.CREATED)
    public UserProfileResponse blockUser(
            Authentication authentication,
            @Valid @RequestBody ContactRequest request
    ) {
        return authService.blockUser(authentication.getName(), request.username());
    }

    @DeleteMapping("/blocks/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unblockUser(Authentication authentication, @PathVariable String username) {
        authService.unblockUser(authentication.getName(), username);
    }
}
