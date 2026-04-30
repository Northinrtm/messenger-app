package com.north.messenger.application.auth;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.ChangePasswordRequest;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UserSessionResponse;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserBlock;
import com.north.messenger.domain.model.UserContact;
import com.north.messenger.domain.model.UserEncryptionRecoverySnapshot;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserBlockRepository;
import com.north.messenger.domain.repository.UserContactRepository;
import com.north.messenger.domain.repository.UserEncryptionRecoverySnapshotRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import com.north.messenger.security.JwtService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
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
    private static final Duration ONLINE_WINDOW = Duration.ofMinutes(2);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-z][a-z0-9_]{2,23}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
    );
    private static final Pattern DISPLAY_NAME_PATTERN = Pattern.compile(
            "^(?=.*[\\p{L}\\p{N}])[\\p{L}\\p{N} ._'\\-]{2,40}$"
    );

    private final UserAccountRepository userAccountRepository;
    private final UserContactRepository userContactRepository;
    private final UserBlockRepository userBlockRepository;
    private final UserSessionRepository userSessionRepository;
    private final UserEncryptionRecoverySnapshotRepository userEncryptionRecoverySnapshotRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicyService passwordPolicyService;
    private final JwtService jwtService;
    private final ApplicationEventPublisher eventPublisher;
    private final AvatarService avatarService;
    private final EmailVerificationService emailVerificationService;
    private final Set<String> allowedRegistrationEmailDomains;

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserContactRepository userContactRepository,
            UserBlockRepository userBlockRepository,
            UserSessionRepository userSessionRepository,
            UserEncryptionRecoverySnapshotRepository userEncryptionRecoverySnapshotRepository,
            ChatRoomRepository chatRoomRepository,
            PasswordEncoder passwordEncoder,
            PasswordPolicyService passwordPolicyService,
            JwtService jwtService,
            ApplicationEventPublisher eventPublisher,
            AvatarService avatarService,
            EmailVerificationService emailVerificationService,
            @Value("${app.auth.registration.allowed-email-domains:gmail.com,googlemail.com,outlook.com,hotmail.com,live.com,msn.com,yahoo.com,yahoo.co.uk,yahoo.co.jp,icloud.com,me.com,mac.com,yandex.ru,yandex.com,ya.ru,mail.ru,bk.ru,inbox.ru,list.ru,rambler.ru,lenta.ru,myrambler.ru,autorambler.ru,proton.me,protonmail.com,pm.me,aol.com,gmx.com,gmx.de,gmx.net,fastmail.com,zoho.com}") String[] allowedRegistrationEmailDomains
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userContactRepository = userContactRepository;
        this.userBlockRepository = userBlockRepository;
        this.userSessionRepository = userSessionRepository;
        this.userEncryptionRecoverySnapshotRepository = userEncryptionRecoverySnapshotRepository;
        this.chatRoomRepository = chatRoomRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicyService = passwordPolicyService;
        this.jwtService = jwtService;
        this.eventPublisher = eventPublisher;
        this.avatarService = avatarService;
        this.emailVerificationService = emailVerificationService;
        this.allowedRegistrationEmailDomains = Arrays.stream(allowedRegistrationEmailDomains)
                .map(domain -> domain == null ? "" : domain.trim().toLowerCase(Locale.ROOT))
                .filter(domain -> !domain.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Transactional
    public IssuedAuthSession register(RegisterRequest request, String userAgent) {
        String username = normalizeUsername(request.username());
        String email = normalizeEmail(request.email());
        String displayName = normalizeDisplayName(request.displayName());
        validateUsername(username);
        validateEmail(email);
        validateDisplayName(displayName);
        validateRegistrationEmailDomain(email);
        if (userAccountRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }
        if (userAccountRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }
        if (userAccountRepository.existsByDisplayNameIgnoreCase(displayName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Display name is already taken");
        }
        passwordPolicyService.validatePassword(username, displayName, request.password());

        Instant now = Instant.now();
        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                username,
                email,
                displayName,
                null,
                null,
                passwordEncoder.encode(request.password()),
                now,
                null
        );
        userAccountRepository.save(user);
        emailVerificationService.issueVerificationForRegisteredUser(user);
        return createSessionResponse(user, userAgent);
    }

    @Transactional
    public IssuedAuthSession login(LoginRequest request, String userAgent) {
        UserAccount user = findUserByUsername(request.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return createSessionResponse(user, userAgent);
    }

    @Transactional
    public IssuedAuthSession refresh(String refreshToken) {
        UserSession session = requireActiveSessionForUpdate(refreshToken);
        UserAccount user = requireUserById(session.getUserId());
        return rotateSession(user, session);
    }

    @Transactional
    public void logout(String refreshToken) {
        findSessionByRefreshToken(refreshToken)
                .filter(session -> !session.isRevoked())
                .ifPresent(session -> {
                    UserAccount user = userAccountRepository.findById(session.getUserId()).orElse(null);
                    Instant now = Instant.now();
                    session.revoke(now);
                    userSessionRepository.save(session);
                    if (user != null) {
                        notifySessionRevoked(user.getUsername(), session.getId());
                    }
                });
    }

    @Transactional
    public void deleteAccount(String username) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        List<UUID> activeSessionIds = userSessionRepository
                .findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(currentUser.getId())
                .stream()
                .map(UserSession::getId)
                .toList();

        userAccountRepository.delete(currentUser);
        userAccountRepository.flush();
        chatRoomRepository.deleteDirectRoomsWithFewerThanTwoParticipants();
        chatRoomRepository.deleteRoomsWithoutParticipants();

        activeSessionIds.forEach(sessionId -> notifySessionRevoked(currentUser.getUsername(), sessionId));
    }

    public UserProfileResponse me(String username) {
        return toProfile(requireAuthenticatedUser(username));
    }

    @Transactional
    public UserProfileResponse updateProfile(String username, String displayName, String profession) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        String normalizedDisplayName = normalizeDisplayName(displayName);
        String normalizedProfession = normalizeProfession(profession);
        validateDisplayName(normalizedDisplayName);
        if (userAccountRepository.existsByDisplayNameIgnoreCaseAndIdNot(normalizedDisplayName, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Display name is already taken");
        }

        currentUser.updateDisplayName(normalizedDisplayName);
        currentUser.updateProfession(normalizedProfession);
        userAccountRepository.save(currentUser);
        return toProfile(currentUser);
    }

    @Transactional
    public void changePassword(String username, ChangePasswordRequest request) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        if (!passwordEncoder.matches(request.currentPassword(), currentUser.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current password is invalid");
        }
        if (passwordEncoder.matches(request.newPassword(), currentUser.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password must be different from current password");
        }

        passwordPolicyService.validatePassword(currentUser.getUsername(), currentUser.getDisplayName(), request.newPassword());

        String recoverySnapshotPayloadJson = normalizeOptionalRecoverySnapshotField(
                request.recoverySnapshotPayloadJson(),
                "recoverySnapshotPayloadJson"
        );
        String recoveryWrappedIdentityRecordJson = normalizeOptionalRecoverySnapshotField(
                request.recoveryWrappedIdentityRecordJson(),
                "recoveryWrappedIdentityRecordJson"
        );
        if ((recoverySnapshotPayloadJson == null) != (recoveryWrappedIdentityRecordJson == null)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted chat recovery re-wrap is incomplete"
            );
        }

        currentUser.updatePasswordHash(passwordEncoder.encode(request.newPassword()));
        long nextPasswordVersion = currentUser.advancePasswordVersion();
        userAccountRepository.save(currentUser);
        if (recoverySnapshotPayloadJson != null && recoveryWrappedIdentityRecordJson != null) {
            upsertRecoverySnapshotForPasswordVersion(
                    currentUser.getId(),
                    recoverySnapshotPayloadJson,
                    recoveryWrappedIdentityRecordJson,
                    nextPasswordVersion
            );
        }

        Instant now = Instant.now();
        userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(currentUser.getId())
                .forEach(session -> {
                    if (!session.isRevoked()) {
                        session.revoke(now);
                        userSessionRepository.save(session);
                        notifySessionRevoked(currentUser.getUsername(), session.getId());
                    }
                });
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

    public List<UserProfileResponse> listContacts(String username) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        List<UserContact> contacts = userContactRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.getId());
        Map<UUID, UserAccount> contactsById = findUsersById(
                contacts.stream().map(UserContact::getContactUserId).toList()
        );
        Map<UUID, Boolean> onlineByUserId = resolveOnlineByUserIds(contactsById.keySet());

        return contacts.stream()
                .map(contact -> contactsById.get(contact.getContactUserId()))
                .filter(Objects::nonNull)
                .map(user -> toProfile(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();
    }

    public List<UserProfileResponse> listBlockedUsers(String username) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        List<UserBlock> blocks = userBlockRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.getId());
        Map<UUID, UserAccount> blockedUsersById = findUsersById(
                blocks.stream().map(UserBlock::getBlockedUserId).toList()
        );
        Map<UUID, Boolean> onlineByUserId = resolveOnlineByUserIds(blockedUsersById.keySet());

        return blocks.stream()
                .map(block -> blockedUsersById.get(block.getBlockedUserId()))
                .filter(Objects::nonNull)
                .map(user -> toProfile(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();
    }

    @Transactional
    public UserProfileResponse addContact(String username, String contactUsername) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        UserAccount contactUser = requireExistingUser(contactUsername);
        if (currentUser.getId().equals(contactUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot add yourself to contacts");
        }
        assertUsersCanCommunicate(currentUser, contactUser);

        userContactRepository.findByUserIdAndContactUserId(currentUser.getId(), contactUser.getId())
                .orElseGet(() -> userContactRepository.save(
                        new UserContact(UUID.randomUUID(), currentUser.getId(), contactUser.getId(), Instant.now())
                ));

        return toProfile(contactUser);
    }

    @Transactional
    public UserProfileResponse blockUser(String username, String blockedUsername) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        UserAccount blockedUser = requireExistingUser(blockedUsername);
        if (currentUser.getId().equals(blockedUser.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot block yourself");
        }

        userBlockRepository.findByUserIdAndBlockedUserId(currentUser.getId(), blockedUser.getId())
                .orElseGet(() -> userBlockRepository.save(
                        new UserBlock(UUID.randomUUID(), currentUser.getId(), blockedUser.getId(), Instant.now())
                ));
        userContactRepository.deleteByUserIdAndContactUserId(currentUser.getId(), blockedUser.getId());

        return toProfile(blockedUser);
    }

    @Transactional
    public void unblockUser(String username, String blockedUsername) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        findUserByUsername(blockedUsername)
                .ifPresent(blockedUser ->
                        userBlockRepository.deleteByUserIdAndBlockedUserId(currentUser.getId(), blockedUser.getId())
                );
    }

    @Transactional
    public void removeContact(String username, String contactUsername) {
        UserAccount currentUser = requireAuthenticatedUser(username);
        findUserByUsername(contactUsername)
                .ifPresent(contactUser ->
                        userContactRepository.deleteByUserIdAndContactUserId(currentUser.getId(), contactUser.getId())
                );
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
            Instant now = Instant.now();
            session.revoke(now);
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
        if (user == null || session == null) {
            return Optional.empty();
        }
        if (!claims.expiresAt().isAfter(Instant.now())) {
            return Optional.empty();
        }
        return authenticateSession(user, session, claims.username(), true);
    }

    @Transactional
    public Optional<AuthenticatedSession> authenticateSession(String username, UUID sessionId) {
        return authenticateSession(username, sessionId, true);
    }

    public boolean isSessionActive(String username, UUID sessionId) {
        return authenticateSession(username, sessionId, false).isPresent();
    }

    public boolean isSessionActive(UUID userId, UUID sessionId) {
        if (userId == null || sessionId == null) {
            return false;
        }
        Instant now = Instant.now();
        return userSessionRepository.existsByIdAndUserIdAndRevokedAtIsNullAndExpiresAtAfterAndLastUsedAtAfter(
                sessionId,
                userId,
                now,
                now.minus(ONLINE_WINDOW)
        );
    }

    // Presence uses a short online window, but websocket authorization should only depend on
    // whether the auth session is still valid and not revoked.
    public boolean isSessionAuthorized(UUID userId, UUID sessionId) {
        if (userId == null || sessionId == null) {
            return false;
        }
        return userSessionRepository.existsByIdAndUserIdAndRevokedAtIsNullAndExpiresAtAfter(
                sessionId,
                userId,
                Instant.now()
        );
    }

    public Set<UUID> findAuthorizedSessionIds(UUID userId, Collection<UUID> sessionIds) {
        if (userId == null || sessionIds == null || sessionIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(userSessionRepository.findValidIdsByUserIdAndIdIn(
                userId,
                Set.copyOf(sessionIds),
                Instant.now()
        ));
    }

    public Set<UUID> findActiveSessionIds(UUID userId, Collection<UUID> sessionIds) {
        if (userId == null || sessionIds == null || sessionIds.isEmpty()) {
            return Set.of();
        }
        Instant now = Instant.now();
        return Set.copyOf(userSessionRepository.findActiveIdsByUserIdAndIdIn(
                userId,
                Set.copyOf(sessionIds),
                now,
                now.minus(ONLINE_WINDOW)
        ));
    }

    private Optional<AuthenticatedSession> authenticateSession(String username, UUID sessionId, boolean touchSession) {
        UserSession session = userSessionRepository.findById(sessionId).orElse(null);
        if (session == null) {
            return Optional.empty();
        }

        UserAccount user = userAccountRepository.findById(session.getUserId()).orElse(null);
        if (user == null) {
            return Optional.empty();
        }

        return authenticateSession(user, session, username, touchSession);
    }

    public AuthenticatedSession requireAuthenticatedSession(String username, UUID sessionId) {
        return authenticateSession(username, sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated session not found"));
    }

    private Optional<AuthenticatedSession> authenticateSession(
            UserAccount user,
            UserSession session,
            String expectedUsername,
            boolean touchSession
    ) {
        Instant now = Instant.now();
        if (!session.isActiveAt(now)) {
            return Optional.empty();
        }
        if (!session.getUserId().equals(user.getId()) || !user.getUsername().equals(expectedUsername)) {
            return Optional.empty();
        }

        if (touchSession && session.shouldTouchAt(now)) {
            session.touch(now);
            userSessionRepository.save(session);
        }

        return Optional.of(new AuthenticatedSession(user, session.getId()));
    }

    public UserAccount requireAuthenticatedUser(String username) {
        return findUserByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    public AuthenticatedSession requireAuthenticatedSession(String username, String accessToken) {
        AuthenticatedSession authenticatedSession = authenticateAccessToken(accessToken)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated session not found"));

        if (!authenticatedSession.user().getUsername().equals(username)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated session does not belong to current user");
        }

        return authenticatedSession;
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
                user.getProfession(),
                avatarService.resolveAvatarUrl(user),
                online
        );
    }

    public boolean isBlockedEitherDirection(UUID firstUserId, UUID secondUserId) {
        return userBlockRepository.existsByUserIdAndBlockedUserId(firstUserId, secondUserId)
                || userBlockRepository.existsByUserIdAndBlockedUserId(secondUserId, firstUserId);
    }

    public Set<UUID> findUsersBlockedEitherDirection(UUID userId, Collection<UUID> otherUserIds) {
        if (userId == null || otherUserIds == null || otherUserIds.isEmpty()) {
            return Set.of();
        }

        LinkedHashSet<UUID> normalizedUserIds = otherUserIds.stream()
                .filter(Objects::nonNull)
                .filter(otherUserId -> !userId.equals(otherUserId))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (normalizedUserIds.isEmpty()) {
            return Set.of();
        }

        LinkedHashSet<UUID> blockedUserIds = new LinkedHashSet<>(
                userBlockRepository.findBlockedUserIds(userId, normalizedUserIds)
        );
        blockedUserIds.addAll(userBlockRepository.findBlockingUserIds(userId, normalizedUserIds));
        return Set.copyOf(blockedUserIds);
    }

    public void assertUsersCanCommunicate(UserAccount currentUser, UserAccount otherUser) {
        if (isBlockedEitherDirection(currentUser.getId(), otherUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Messaging is unavailable for this user");
        }
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
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getProfession(),
                user.getCreatedAt(),
                avatarService.resolveAvatarUrl(user),
                isUserOnline(user.getId()),
                user.getEmail(),
                user.isEmailVerified(),
                emailVerificationService.isEnabled(),
                user.getPasswordVersion()
        );
    }

    private UserProfileResponse toProfile(UserAccount user, boolean online) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getProfession(),
                user.getCreatedAt(),
                avatarService.resolveAvatarUrl(user),
                online,
                null,
                false,
                false,
                user.getPasswordVersion()
        );
    }

    private void upsertRecoverySnapshotForPasswordVersion(
            UUID userId,
            String snapshotPayloadJson,
            String wrappedIdentityRecordJson,
            long wrappedPasswordVersion
    ) {
        Instant now = Instant.now();
        UserEncryptionRecoverySnapshot snapshot = userEncryptionRecoverySnapshotRepository
                .findByUserId(userId)
                .map(existing -> {
                    existing.update(
                            snapshotPayloadJson,
                            wrappedIdentityRecordJson,
                            existing.getAccountPublicKey(),
                            wrappedPasswordVersion,
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserEncryptionRecoverySnapshot(
                        UUID.randomUUID(),
                        userId,
                        snapshotPayloadJson,
                        wrappedIdentityRecordJson,
                        null,
                        wrappedPasswordVersion,
                        now,
                        now
                ));
        userEncryptionRecoverySnapshotRepository.save(snapshot);
    }

    private String normalizeOptionalRecoverySnapshotField(String value, String fieldName) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    fieldName + " must not be blank"
            );
        }
        return normalized;
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

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private void validateUsername(String username) {
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Username must be 3-24 characters, start with a letter, and use only letters, numbers or underscore"
            );
        }
    }

    private void validateEmail(String email) {
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email must use a valid address format");
        }
    }

    private void validateDisplayName(String displayName) {
        if (!DISPLAY_NAME_PATTERN.matcher(displayName).matches()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Display name must contain letters or numbers and may use spaces, dot, underscore, apostrophe or dash"
            );
        }
    }

    private void validateRegistrationEmailDomain(String email) {
        int separatorIndex = email.lastIndexOf('@');
        if (separatorIndex < 0 || separatorIndex == email.length() - 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email must be valid");
        }

        String domain = email.substring(separatorIndex + 1);
        if (!allowedRegistrationEmailDomains.contains(domain)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Email domain is not supported for registration"
            );
        }
    }

    private String normalizeProfession(String profession) {
        if (profession == null) {
            return null;
        }

        String normalized = profession.trim();
        if (normalized.length() > 160) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile about text must be 160 characters or fewer");
        }
        return normalized.isBlank() ? null : normalized;
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

    private Map<UUID, UserAccount> findUsersById(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }

        return userAccountRepository.findAllByIdIn(userIds).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
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

    private IssuedAuthSession createSessionResponse(UserAccount user, String userAgent) {
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
        return buildIssuedAuthSession(user, session, refreshTokenSecret.rawValue(), now);
    }

    private IssuedAuthSession rotateSession(UserAccount user, UserSession session) {
        Instant now = Instant.now();
        RefreshTokenSecret refreshTokenSecret = generateRefreshTokenSecret();
        session.rotate(refreshTokenSecret.hash(), now, jwtService.refreshTokenExpiresAt(now));
        userSessionRepository.save(session);
        return buildIssuedAuthSession(user, session, refreshTokenSecret.rawValue(), now);
    }

    private IssuedAuthSession buildIssuedAuthSession(
            UserAccount user,
            UserSession session,
            String refreshSecret,
            Instant issuedAt
    ) {
        JwtService.IssuedAccessToken accessToken = jwtService.issueAccessToken(user, session.getId(), issuedAt);
        return new IssuedAuthSession(
                new AuthResponse(
                        accessToken.token(),
                        accessToken.expiresAt(),
                        session.getId(),
                        toProfile(user)
                ),
                formatRefreshToken(session.getId(), refreshSecret)
        );
    }

    private UserSession requireActiveSessionForUpdate(String refreshToken) {
        RefreshTokenId tokenId;
        try {
            tokenId = parseRefreshToken(refreshToken);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token is invalid");
        }

        UserSession session = userSessionRepository.findByIdForUpdate(tokenId.sessionId())
                .filter(candidate -> constantTimeEquals(candidate.getTokenHash(), hashRefreshSecret(tokenId.secret())))
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

    public record IssuedAuthSession(
            AuthResponse response,
            String refreshToken
    ) {
    }

}
