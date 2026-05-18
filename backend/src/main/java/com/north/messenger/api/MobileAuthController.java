package com.north.messenger.api;

import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.MobileAuthResponse;
import com.north.messenger.api.dto.MobileRefreshTokenRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.application.auth.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Mobile authentication", description = "Token-based authentication flows for the Android/mobile client")
public class MobileAuthController {

    private final AuthService authService;

    public MobileAuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @Operation(
            summary = "Register a mobile account session",
            description = "Creates a user account and returns both the access token and refresh token in the JSON response for mobile clients."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public MobileAuthResponse register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest
    ) {
        return MobileAuthResponse.fromIssuedSession(
                authService.register(request, httpRequest.getHeader("User-Agent"))
        );
    }

    @PostMapping("/login")
    @Operation(
            summary = "Log in from mobile",
            description = "Authenticates a mobile client and returns both the access token and refresh token in the JSON response body."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public MobileAuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest
    ) {
        return MobileAuthResponse.fromIssuedSession(
                authService.login(request, httpRequest.getHeader("User-Agent"))
        );
    }

    @PostMapping("/refresh")
    @Operation(
            summary = "Refresh a mobile session",
            description = "Uses the mobile refresh token payload to issue a fresh access token and replacement refresh token."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public MobileAuthResponse refresh(@Valid @RequestBody MobileRefreshTokenRequest request) {
        return MobileAuthResponse.fromIssuedSession(authService.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Log out from mobile",
            description = "Revokes the supplied mobile refresh token."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
    })
    public void logout(@Valid @RequestBody MobileRefreshTokenRequest request) {
        authService.logout(request.refreshToken());
    }
}
