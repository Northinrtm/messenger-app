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
    public void confirmEmailVerification(@Valid @RequestBody EmailVerificationConfirmRequest request) {
        emailVerificationService.verifyEmail(request.token());
    }

    @PostMapping("/email-verification/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendEmailVerification(@Valid @RequestBody EmailVerificationResendRequest request) {
        emailVerificationService.resendVerificationEmail(request.email());
    }

    @PostMapping("/me/email-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendOwnEmailVerification(Authentication authentication) {
        emailVerificationService.resendVerificationEmailForAuthenticatedUser(authentication.getName());
    }

    @PostMapping("/password-reset/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.requestPasswordReset(request.email());
    }

    @PostMapping("/password-reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmPasswordReset(
            @Valid @RequestBody PasswordResetConfirmRequest request,
            HttpServletResponse httpResponse
    ) {
        passwordResetService.resetPassword(request.token(), request.newPassword());
        refreshTokenCookieService.clear(httpResponse);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        AuthService.IssuedAuthSession issuedAuthSession = authService.refresh(requireRefreshToken(httpRequest));
        refreshTokenCookieService.write(httpResponse, issuedAuthSession.refreshToken());
        return issuedAuthSession.response();
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        refreshTokenCookieService.extract(httpRequest).ifPresent(authService::logout);
        refreshTokenCookieService.clear(httpResponse);
    }

    @GetMapping("/me")
    public UserProfileResponse me(Authentication authentication) {
        return authService.me(authentication.getName());
    }

    @PutMapping("/me")
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
    public List<UserMailboxResponse> listOwnMailboxes(Authentication authentication) {
        return userMailboxService.listOwnMailboxes(authentication.getName());
    }

    @PostMapping("/me/mailboxes")
    @ResponseStatus(HttpStatus.CREATED)
    public UserMailboxResponse addOwnMailbox(
            Authentication authentication,
            @Valid @RequestBody CreateUserMailboxRequest request
    ) {
        return userMailboxService.addOwnMailbox(authentication.getName(), request.email());
    }

    @DeleteMapping("/me/mailboxes/{mailboxId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeOwnMailbox(Authentication authentication, @PathVariable UUID mailboxId) {
        userMailboxService.removeOwnMailbox(authentication.getName(), mailboxId);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletResponse httpResponse
    ) {
        authService.changePassword(authentication.getName(), request);
        refreshTokenCookieService.clear(httpResponse);
    }

    @PutMapping("/me/avatar")
    public UserProfileResponse updateAvatar(
            Authentication authentication,
            @Valid @RequestBody UpdateAvatarRequest request
    ) {
        return authService.updateAvatar(authentication.getName(), request.avatarUrl());
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount(Authentication authentication, HttpServletResponse httpResponse) {
        authService.deleteAccount(authentication.getName());
        refreshTokenCookieService.clear(httpResponse);
    }

    @GetMapping("/sessions")
    public List<UserSessionResponse> listSessions(Authentication authentication) {
        return authService.listSessions(authentication.getName());
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
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
