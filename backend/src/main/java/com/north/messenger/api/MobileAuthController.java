package com.north.messenger.api;

import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.MobileAuthResponse;
import com.north.messenger.api.dto.MobileRefreshTokenRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.application.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mobile/auth")
public class MobileAuthController {

    private final AuthService authService;

    public MobileAuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public MobileAuthResponse register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest
    ) {
        return MobileAuthResponse.fromIssuedSession(
                authService.register(request, httpRequest.getHeader("User-Agent"))
        );
    }

    @PostMapping("/login")
    public MobileAuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest
    ) {
        return MobileAuthResponse.fromIssuedSession(
                authService.login(request, httpRequest.getHeader("User-Agent"))
        );
    }

    @PostMapping("/refresh")
    public MobileAuthResponse refresh(@Valid @RequestBody MobileRefreshTokenRequest request) {
        return MobileAuthResponse.fromIssuedSession(authService.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody MobileRefreshTokenRequest request) {
        authService.logout(request.refreshToken());
    }
}
