package com.north.messenger.api;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.RefreshTokenRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UpdateAvatarRequest;
import com.north.messenger.api.dto.UpdateProfileRequest;
import com.north.messenger.api.dto.UserSessionResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
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

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request, HttpServletRequest httpRequest) {
        return authService.register(request, httpRequest.getHeader("User-Agent"));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return authService.login(request, httpRequest.getHeader("User-Agent"));
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return authService.refresh(request);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(request);
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
        return authService.updateProfile(authentication.getName(), request.displayName());
    }

    @PutMapping("/me/avatar")
    public UserProfileResponse updateAvatar(
            Authentication authentication,
            @Valid @RequestBody UpdateAvatarRequest request
    ) {
        return authService.updateAvatar(authentication.getName(), request.avatarUrl());
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
}
