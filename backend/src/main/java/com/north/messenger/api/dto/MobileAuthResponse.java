package com.north.messenger.api.dto;

import com.north.messenger.application.auth.AuthService;
import java.time.Instant;
import java.util.UUID;

public record MobileAuthResponse(
        String token,
        Instant tokenExpiresAt,
        UUID sessionId,
        UserProfileResponse user,
        String refreshToken
) {

    public static MobileAuthResponse fromIssuedSession(AuthService.IssuedAuthSession issuedAuthSession) {
        AuthResponse response = issuedAuthSession.response();
        return new MobileAuthResponse(
                response.token(),
                response.tokenExpiresAt(),
                response.sessionId(),
                response.user(),
                issuedAuthSession.refreshToken()
        );
    }
}
