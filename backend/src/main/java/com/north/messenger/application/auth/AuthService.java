package com.north.messenger.application.auth;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.RefreshTokenRequest;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UserSessionResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import com.north.messenger.security.JwtService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int REFRESH_TOKEN_BYTES = 32;

    private final UserAccountRepository userAccountRepository;
    private final UserSessionRepository userSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserSessionRepository userSessionRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userSessionRepository = userSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String username = normalizeUsername(request.username());
        if (userAccountRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                username,
                request.displayName().trim(),
                passwordEncoder.encode(request.password()),
                Instant.now()
        );
        userAccountRepository.save(user);
        return createSessionResponse(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        UserAccount user = requireUser(request.username());
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return createSessionResponse(user);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        UserSession session = requireActiveSession(request.refreshToken());
        UserAccount user = requireUserById(session.getUserId());
        return rotateSession(user, session);
    }

    @Transactional
    public void logout(RefreshTokenRequest request) {
        findSessionByRefreshToken(request.refreshToken())
                .filter(session -> !session.isRevoked())
                .ifPresent(session -> {
                    session.revoke(Instant.now());
                    userSessionRepository.save(session);
                });
    }

    public UserProfileResponse me(String username) {
        return toProfile(requireUser(username));
    }

    public List<UserSessionResponse> listSessions(String username) {
        UserAccount currentUser = requireUser(username);
        Instant now = Instant.now();

        return userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(currentUser.getId()).stream()
                .filter(session -> session.isActiveAt(now))
                .map(this::toSessionResponse)
                .toList();
    }

    @Transactional
    public void revokeSession(String username, UUID sessionId) {
        UserAccount currentUser = requireUser(username);
        UserSession session = userSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));

        if (!session.getUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Session does not belong to current user");
        }

        if (!session.isRevoked()) {
            session.revoke(Instant.now());
            userSessionRepository.save(session);
        }
    }

    public UserAccount requireUser(String username) {
        String normalizedUsername = normalizeUsername(username);
        return userAccountRepository.findByUsernameIgnoreCase(normalizedUsername)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    public ParticipantResponse toParticipant(UserAccount user) {
        return new ParticipantResponse(user.getId(), user.getUsername(), user.getDisplayName());
    }

    private UserAccount requireUserById(UUID userId) {
        return userAccountRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private UserProfileResponse toProfile(UserAccount user) {
        return new UserProfileResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getCreatedAt());
    }

    private UserSessionResponse toSessionResponse(UserSession session) {
        return new UserSessionResponse(
                session.getId(),
                session.getCreatedAt(),
                session.getLastUsedAt(),
                session.getExpiresAt()
        );
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private AuthResponse createSessionResponse(UserAccount user) {
        Instant now = Instant.now();
        RefreshTokenSecret refreshTokenSecret = generateRefreshTokenSecret();
        UserSession session = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                refreshTokenSecret.hash(),
                now,
                now,
                jwtService.refreshTokenExpiresAt(now),
                null
        );
        userSessionRepository.save(session);
        return buildAuthResponse(user, session, refreshTokenSecret.rawValue(), now);
    }

    private AuthResponse rotateSession(UserAccount user, UserSession session) {
        Instant now = Instant.now();
        RefreshTokenSecret refreshTokenSecret = generateRefreshTokenSecret();
        session.rotate(refreshTokenSecret.hash(), now, jwtService.refreshTokenExpiresAt(now));
        userSessionRepository.save(session);
        return buildAuthResponse(user, session, refreshTokenSecret.rawValue(), now);
    }

    private AuthResponse buildAuthResponse(
            UserAccount user,
            UserSession session,
            String refreshSecret,
            Instant issuedAt
    ) {
        JwtService.IssuedAccessToken accessToken = jwtService.issueAccessToken(user, issuedAt);
        return new AuthResponse(
                accessToken.token(),
                accessToken.expiresAt(),
                formatRefreshToken(session.getId(), refreshSecret),
                session.getExpiresAt(),
                session.getId(),
                toProfile(user)
        );
    }

    private UserSession requireActiveSession(String refreshToken) {
        UserSession session = findSessionByRefreshToken(refreshToken)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token is invalid"));

        if (!session.isActiveAt(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token is expired or revoked");
        }

        return session;
    }

    private Optional<UserSession> findSessionByRefreshToken(String refreshToken) {
        RefreshTokenId tokenId;
        try {
            tokenId = parseRefreshToken(refreshToken);
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }

        return userSessionRepository.findById(tokenId.sessionId())
                .filter(session -> constantTimeEquals(session.getTokenHash(), hashRefreshSecret(tokenId.secret())));
    }

    private RefreshTokenSecret generateRefreshTokenSecret() {
        byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String rawValue = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new RefreshTokenSecret(rawValue, hashRefreshSecret(rawValue));
    }

    private String hashRefreshSecret(String refreshSecret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(refreshSecret.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for refresh token hashing", exception);
        }
    }

    private boolean constantTimeEquals(String left, String right) {
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.UTF_8),
                right.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String formatRefreshToken(UUID sessionId, String secret) {
        return sessionId + "." + secret;
    }

    private RefreshTokenId parseRefreshToken(String refreshToken) {
        String[] segments = refreshToken.trim().split("\\.", 2);
        if (segments.length != 2 || segments[1].isBlank()) {
            throw new IllegalArgumentException("Refresh token format is invalid");
        }

        return new RefreshTokenId(UUID.fromString(segments[0]), segments[1]);
    }

    private record RefreshTokenSecret(
            String rawValue,
            String hash
    ) {
    }

    private record RefreshTokenId(
            UUID sessionId,
            String secret
    ) {
    }
}
