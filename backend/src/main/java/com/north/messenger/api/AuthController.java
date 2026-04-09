package com.north.messenger.api;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.ChangePasswordRequest;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UpdateAvatarRequest;
import com.north.messenger.api.dto.UpdateProfileRequest;
import com.north.messenger.api.dto.UserSessionResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final RefreshTokenCookieService refreshTokenCookieService;

    public AuthController(AuthService authService, RefreshTokenCookieService refreshTokenCookieService) {
        this.authService = authService;
        this.refreshTokenCookieService = refreshTokenCookieService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
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
        return authService.updateProfile(authentication.getName(), request.displayName(), request.profession());
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        authService.changePassword(authentication.getName(), request);
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
