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
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int REFRESH_TOKEN_BYTES = 32;
    private static final Duration ONLINE_WINDOW = Duration.ofMinutes(2);

    private final UserAccountRepository userAccountRepository;
    private final UserSessionRepository userSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ApplicationEventPublisher eventPublisher;

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserSessionRepository userSessionRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            ApplicationEventPublisher eventPublisher
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userSessionRepository = userSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        return register(request, null);
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, String userAgent) {
        String username = normalizeUsername(request.username());
        String displayName = normalizeDisplayName(request.displayName());
        if (userAccountRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }
        if (userAccountRepository.existsByDisplayNameIgnoreCase(displayName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Display name is already taken");
        }

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                username,
                displayName,
                passwordEncoder.encode(request.password()),
                Instant.now()
        );
        userAccountRepository.save(user);
        return createSessionResponse(user, userAgent);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        return login(request, null);
    }

    @Transactional
    public AuthResponse login(LoginRequest request, String userAgent) {
        UserAccount user = findUserByUsername(request.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return createSessionResponse(user, userAgent);
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
                    UserAccount user = userAccountRepository.findById(session.getUserId()).orElse(null);
                    session.revoke(Instant.now());
                    userSessionRepository.save(session);
                    if (user != null) {
                        notifySessionRevoked(user.getUsername(), session.getId());
                    }
                });
    }

    public UserProfileResponse me(String username) {
        return toProfile(requireAuthenticatedUser(username));
    }

    @Transactional
    public UserProfileResponse updateProfile(String username, String displayName) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        String normalizedDisplayName = normalizeDisplayName(displayName);
        if (userAccountRepository.existsByDisplayNameIgnoreCaseAndIdNot(normalizedDisplayName, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Display name is already taken");
        }

        currentUser.updateDisplayName(normalizedDisplayName);
        userAccountRepository.save(currentUser);
        return toProfile(currentUser);
    }

    public List<UserProfileResponse> searchUsers(String username, String query) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        String normalizedQuery = normalizeSearchQuery(query);
        if (normalizedQuery.isBlank()) {
            return List.of();
        }

        List<UserAccount> users = userAccountRepository.searchByUsernameOrDisplayName(
                        currentUser.getId(),
                        normalizedQuery,
                        PageRequest.of(0, 8)
                );
        Map<UUID, Boolean> onlineByUserId = resolveOnlineByUserIds(
                users.stream().map(UserAccount::getId).toList()
        );

        return users.stream()
                .map(user -> toProfile(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();
    }

    @Transactional
    public UserProfileResponse updateAvatar(String username, String avatarUrl) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        currentUser.updateAvatarUrl(normalizeAvatarUrl(avatarUrl));
        userAccountRepository.save(currentUser);
        return toProfile(currentUser);
    }

    public List<UserSessionResponse> listSessions(String username) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        Instant now = Instant.now();

        return userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(currentUser.getId()).stream()
                .filter(session -> session.isActiveAt(now))
                .map(this::toSessionResponse)
                .toList();
    }

    @Transactional
    public void revokeSession(String username, UUID sessionId) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        UserSession session = userSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));

        if (!session.getUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Session does not belong to current user");
        }

        if (!session.isRevoked()) {
            session.revoke(Instant.now());
            userSessionRepository.save(session);
            notifySessionRevoked(currentUser.getUsername(), session.getId());
        }
    }

    @Transactional
    public Optional<AuthenticatedSession> authenticateAccessToken(String token) {
        JwtService.AccessTokenClaims claims;
        try {
            claims = jwtService.readAccessToken(token);
        } catch (RuntimeException exception) {
            return Optional.empty();
        }

        UserAccount user = userAccountRepository.findById(claims.userId()).orElse(null);
        UserSession session = userSessionRepository.findById(claims.sessionId()).orElse(null);
        Instant now = Instant.now();

        if (user == null || session == null || !session.isActiveAt(now) || !claims.expiresAt().isAfter(now)) {
            return Optional.empty();
        }
        if (!session.getUserId().equals(user.getId()) || !user.getUsername().equals(claims.username())) {
            return Optional.empty();
        }

        if (session.shouldTouchAt(now)) {
            session.touch(now);
            userSessionRepository.save(session);
        }

        return Optional.of(new AuthenticatedSession(user, session.getId()));
    }

    public UserAccount requireAuthenticatedUser(String username) {
        return findUserByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    public UserAccount requireExistingUser(String username) {
        return findUserByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    public ParticipantResponse toParticipant(UserAccount user) {
        return toParticipant(user, isUserOnline(user.getId()));
    }

    public ParticipantResponse toParticipant(UserAccount user, boolean online) {
        return new ParticipantResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                online
        );
    }

    public Map<UUID, Boolean> resolveOnlineByUserIds(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }

        Set<UUID> activeUserIds = Set.copyOf(
                userSessionRepository.findDistinctOnlineUserIdsByUserIdIn(
                        userIds,
                        Instant.now(),
                        Instant.now().minus(ONLINE_WINDOW)
                )
        );

        return userIds.stream()
                .distinct()
                .collect(Collectors.toMap(Function.identity(), activeUserIds::contains));
    }

    private UserAccount requireUserById(UUID userId) {
        return userAccountRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    private UserProfileResponse toProfile(UserAccount user) {
        return toProfile(user, isUserOnline(user.getId()));
    }

    private UserProfileResponse toProfile(UserAccount user, boolean online) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getCreatedAt(),
                user.getAvatarUrl(),
                online
        );
    }

    private UserSessionResponse toSessionResponse(UserSession session) {
        return new UserSessionResponse(
                session.getId(),
                session.getCreatedAt(),
                session.getLastUsedAt(),
                session.getExpiresAt(),
                session.getDeviceName()
        );
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeDisplayName(String displayName) {
        return displayName.trim();
    }

    private String normalizeSearchQuery(String query) {
        if (query == null) {
            return "";
        }

        String normalized = query.trim();
        if (normalized.startsWith("@")) {
            normalized = normalized.substring(1).trim();
        }

        return normalized;
    }

    private String normalizeAvatarUrl(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return null;
        }
        if (!avatarUrl.startsWith("data:image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar must be an image");
        }

        return avatarUrl;
    }

    private boolean isUserOnline(UUID userId) {
        Instant now = Instant.now();
        return userSessionRepository.existsByUserIdAndRevokedAtIsNullAndExpiresAtAfterAndLastUsedAtAfter(
                userId,
                now,
                now.minus(ONLINE_WINDOW)
        );
    }

    private String resolveDeviceName(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "Unknown device";
        }

        String normalized = userAgent.toLowerCase(Locale.ROOT);
        return detectClient(normalized) + " on " + detectPlatform(normalized);
    }

    private String detectPlatform(String userAgent) {
        if (userAgent.contains("android")) {
            return "Android";
        }
        if (userAgent.contains("iphone") || userAgent.contains("ipad") || userAgent.contains("ios")) {
            return "iOS";
        }
        if (userAgent.contains("mac os x") || userAgent.contains("macintosh")) {
            return "macOS";
        }
        if (userAgent.contains("windows")) {
            return "Windows";
        }
        if (userAgent.contains("linux")) {
            return "Linux";
        }

        return "Unknown OS";
    }

    private String detectClient(String userAgent) {
        if (userAgent.contains("edg/")) {
            return "Edge";
        }
        if (userAgent.contains("firefox/")) {
            return "Firefox";
        }
        if (userAgent.contains("chrome/") && !userAgent.contains("edg/")) {
            return "Chrome";
        }
        if (userAgent.contains("safari/") && !userAgent.contains("chrome/")) {
            return "Safari";
        }

        return "Browser";
    }

    private Optional<UserAccount> findUserByUsername(String username) {
        return userAccountRepository.findByUsernameIgnoreCase(normalizeUsername(username));
    }

    private AuthResponse createSessionResponse(UserAccount user, String userAgent) {
        Instant now = Instant.now();
        RefreshTokenSecret refreshTokenSecret = generateRefreshTokenSecret();
        UserSession session = new UserSession(
                UUID.randomUUID(),
                user.getId(),
                refreshTokenSecret.hash(),
                now,
                now,
                jwtService.refreshTokenExpiresAt(now),
                resolveDeviceName(userAgent),
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
        JwtService.IssuedAccessToken accessToken = jwtService.issueAccessToken(user, session.getId(), issuedAt);
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

    private void notifySessionRevoked(String username, UUID sessionId) {
        eventPublisher.publishEvent(new SessionRevokedEvent(username, sessionId));
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

    public record AuthenticatedSession(
            UserAccount user,
            UUID sessionId
    ) {
    }
}
