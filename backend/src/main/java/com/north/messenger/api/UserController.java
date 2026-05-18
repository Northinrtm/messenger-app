package com.north.messenger.api;

import com.north.messenger.api.dto.ContactRequest;
import com.north.messenger.application.auth.AvatarService;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Users", description = "User search, avatars, contacts, and block list management")
public class UserController {

    private final AuthService authService;
    private final AvatarService avatarService;

    public UserController(AuthService authService, AvatarService avatarService) {
        this.authService = authService;
        this.avatarService = avatarService;
    }

    @GetMapping("/search")
    @Operation(
            summary = "Search users",
            description = "Searches for users visible to the authenticated caller."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public List<UserProfileResponse> search(Authentication authentication, @RequestParam String query) {
        return authService.searchUsers(authentication.getName(), query);
    }

    @GetMapping("/{userId}/avatar")
    @Operation(
            summary = "Download a user avatar",
            description = "Returns the raw avatar bytes for a user profile. The response is cacheable and includes ETag metadata."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
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
    @Operation(summary = "List contacts", description = "Returns the authenticated user's saved contact list.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public List<UserProfileResponse> listContacts(Authentication authentication) {
        return authService.listContacts(authentication.getName());
    }

    @GetMapping("/blocks")
    @Operation(summary = "List blocked users", description = "Returns the authenticated user's block list.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public List<UserProfileResponse> listBlockedUsers(Authentication authentication) {
        return authService.listBlockedUsers(authentication.getName());
    }

    @PostMapping("/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a contact", description = "Adds one user to the authenticated user's contact list.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserProfileResponse addContact(
            Authentication authentication,
            @Valid @RequestBody ContactRequest request
    ) {
        return authService.addContact(authentication.getName(), request.username());
    }

    @DeleteMapping("/contacts/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a contact", description = "Deletes one user from the authenticated user's contact list.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void removeContact(Authentication authentication, @PathVariable String username) {
        authService.removeContact(authentication.getName(), username);
    }

    @PostMapping("/blocks")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Block a user", description = "Blocks one user for the authenticated account and removes them from contacts if needed.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserProfileResponse blockUser(
            Authentication authentication,
            @Valid @RequestBody ContactRequest request
    ) {
        return authService.blockUser(authentication.getName(), request.username());
    }

    @DeleteMapping("/blocks/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Unblock a user", description = "Removes one user from the authenticated user's block list.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void unblockUser(Authentication authentication, @PathVariable String username) {
        authService.unblockUser(authentication.getName(), username);
    }
}
