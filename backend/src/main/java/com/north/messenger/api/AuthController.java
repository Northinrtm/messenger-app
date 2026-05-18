package com.north.messenger.api;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.ChangePasswordRequest;
import com.north.messenger.api.dto.EmailVerificationConfirmRequest;
import com.north.messenger.api.dto.EmailVerificationResendRequest;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.CreateUserMailboxRequest;
import com.north.messenger.api.dto.PasswordResetConfirmRequest;
import com.north.messenger.api.dto.PasswordResetRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UpdateAvatarRequest;
import com.north.messenger.api.dto.UpdateProfileRequest;
import com.north.messenger.api.dto.UserMailboxResponse;
import com.north.messenger.api.dto.UserSessionResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.auth.EmailVerificationService;
import com.north.messenger.application.auth.PasswordResetService;
import com.north.messenger.application.auth.UserMailboxService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import com.north.messenger.security.RefreshTokenCookieService;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Browser/session authentication, profile, password, mailbox, and session-management flows")
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;
    private final RefreshTokenCookieService refreshTokenCookieService;
    private final UserMailboxService userMailboxService;

    public AuthController(
            AuthService authService,
            EmailVerificationService emailVerificationService,
            PasswordResetService passwordResetService,
            RefreshTokenCookieService refreshTokenCookieService,
            UserMailboxService userMailboxService
    ) {
        this.authService = authService;
        this.emailVerificationService = emailVerificationService;
        this.passwordResetService = passwordResetService;
        this.refreshTokenCookieService = refreshTokenCookieService;
        this.userMailboxService = userMailboxService;
    }

    @PostMapping("/register")
    @Operation(
            summary = "Register an account",
            description = "Creates a new user account, returns the authenticated session payload, and writes the refresh token cookie for browser clients."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public AuthResponse register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        AuthService.IssuedAuthSession issuedAuthSession = authService.register(request, httpRequest.getHeader("User-Agent"));
        refreshTokenCookieService.write(httpResponse, issuedAuthSession.refreshToken());
        return issuedAuthSession.response();
    }

    @PostMapping("/login")
    @Operation(
            summary = "Log in",
            description = "Authenticates a browser client, returns the access token payload, and writes the refresh token cookie."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public AuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        AuthService.IssuedAuthSession issuedAuthSession = authService.login(request, httpRequest.getHeader("User-Agent"));
        refreshTokenCookieService.write(httpResponse, issuedAuthSession.refreshToken());
        return issuedAuthSession.response();
    }

    @PostMapping("/email-verification/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Confirm email verification",
            description = "Consumes the email verification token previously sent to the user and marks the account email as verified."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError"),
            @ApiResponse(responseCode = "410", ref = "#/components/responses/GoneError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void confirmEmailVerification(@Valid @RequestBody EmailVerificationConfirmRequest request) {
        emailVerificationService.verifyEmail(request.token());
    }

    @PostMapping("/email-verification/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            summary = "Resend email verification",
            description = "Requests a new verification email for an address that already belongs to a user account."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void resendEmailVerification(@Valid @RequestBody EmailVerificationResendRequest request) {
        emailVerificationService.resendVerificationEmail(request.email());
    }

    @PostMapping("/me/email-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            summary = "Resend verification for the current user",
            description = "Sends a new verification email for the authenticated user's current account email."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void resendOwnEmailVerification(Authentication authentication) {
        emailVerificationService.resendVerificationEmailForAuthenticatedUser(authentication.getName());
    }

    @PostMapping("/password-reset/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            summary = "Request password reset",
            description = "Requests a password-reset email for the supplied account email."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.requestPasswordReset(request.email());
    }

    @PostMapping("/password-reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Confirm password reset",
            description = "Resets the user's password by consuming a password-reset token and clears the browser refresh cookie."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void confirmPasswordReset(
            @Valid @RequestBody PasswordResetConfirmRequest request,
            HttpServletResponse httpResponse
    ) {
        passwordResetService.resetPassword(request.token(), request.newPassword());
        refreshTokenCookieService.clear(httpResponse);
    }

    @PostMapping("/refresh")
    @Operation(
            summary = "Refresh the browser session",
            description = "Uses the browser refresh token cookie to issue a fresh access token payload and replacement refresh cookie."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public AuthResponse refresh(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        AuthService.IssuedAuthSession issuedAuthSession = authService.refresh(requireRefreshToken(httpRequest));
        refreshTokenCookieService.write(httpResponse, issuedAuthSession.refreshToken());
        return issuedAuthSession.response();
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Log out the browser session",
            description = "Revokes the refresh token cookie when present and clears it from the browser."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        refreshTokenCookieService.extract(httpRequest).ifPresent(authService::logout);
        refreshTokenCookieService.clear(httpResponse);
    }

    @GetMapping("/me")
    @Operation(summary = "Get current profile", description = "Returns the authenticated user's profile payload.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserProfileResponse me(Authentication authentication) {
        return authService.me(authentication.getName());
    }

    @PutMapping("/me")
    @Operation(
            summary = "Update current profile",
            description = "Updates display name, about/profession text, and optional mail-tab visibility for the authenticated user."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserProfileResponse updateProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return authService.updateProfile(
                authentication.getName(),
                request.displayName(),
                request.profession(),
                request.mailEnabled()
        );
    }

    @GetMapping("/me/mailboxes")
    @Operation(summary = "List own mailboxes", description = "Returns the authenticated user's workspace mailboxes used by the Mail tab.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public List<UserMailboxResponse> listOwnMailboxes(Authentication authentication) {
        return userMailboxService.listOwnMailboxes(authentication.getName());
    }

    @PostMapping("/me/mailboxes")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a mailbox", description = "Adds one mailbox address to the authenticated user's Mail tab configuration.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserMailboxResponse addOwnMailbox(
            Authentication authentication,
            @Valid @RequestBody CreateUserMailboxRequest request
    ) {
        return userMailboxService.addOwnMailbox(authentication.getName(), request.email());
    }

    @DeleteMapping("/me/mailboxes/{mailboxId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a mailbox", description = "Deletes one mailbox from the authenticated user's Mail tab configuration.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void removeOwnMailbox(Authentication authentication, @PathVariable UUID mailboxId) {
        userMailboxService.removeOwnMailbox(authentication.getName(), mailboxId);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Change current password",
            description = "Changes the authenticated user's password and clears the browser refresh token cookie so the user can reauthenticate cleanly."
    )
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletResponse httpResponse
    ) {
        authService.changePassword(authentication.getName(), request);
        refreshTokenCookieService.clear(httpResponse);
    }

    @PutMapping("/me/avatar")
    @Operation(summary = "Update current avatar", description = "Updates the authenticated user's avatar using the provided avatar URL or data source.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public UserProfileResponse updateAvatar(
            Authentication authentication,
            @Valid @RequestBody UpdateAvatarRequest request
    ) {
        return authService.updateAvatar(authentication.getName(), request.avatarUrl());
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete current account", description = "Deletes the authenticated account, anonymizes its profile record, and clears the browser refresh cookie.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void deleteAccount(Authentication authentication, HttpServletResponse httpResponse) {
        authService.deleteAccount(authentication.getName());
        refreshTokenCookieService.clear(httpResponse);
    }

    @GetMapping("/sessions")
    @Operation(summary = "List active sessions", description = "Returns the authenticated user's active sessions and devices.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public List<UserSessionResponse> listSessions(Authentication authentication) {
        return authService.listSessions(authentication.getName());
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke one session", description = "Revokes one active session belonging to the authenticated user.")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void revokeSession(Authentication authentication, @PathVariable UUID sessionId) {
        authService.revokeSession(authentication.getName(), sessionId);
    }

    private String requireRefreshToken(HttpServletRequest request) {
        return refreshTokenCookieService.extract(request)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Refresh token cookie '" + refreshTokenCookieService.cookieName() + "' is missing"
                ));
    }
}
