package com.north.messenger.application.auth;

import com.north.messenger.domain.model.PasswordResetToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserSession;
import com.north.messenger.domain.repository.PasswordResetTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserSessionRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final UserAccountRepository userAccountRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final UserSessionRepository userSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicyService passwordPolicyService;
    private final PasswordResetProperties passwordResetProperties;
    private final ApplicationEventPublisher eventPublisher;

    public PasswordResetService(
            UserAccountRepository userAccountRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            UserSessionRepository userSessionRepository,
            PasswordEncoder passwordEncoder,
            PasswordPolicyService passwordPolicyService,
            PasswordResetProperties passwordResetProperties,
            ApplicationEventPublisher eventPublisher
    ) {
        this.userAccountRepository = userAccountRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.userSessionRepository = userSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicyService = passwordPolicyService;
        this.passwordResetProperties = passwordResetProperties;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public void requestPasswordReset(String email) {
        if (!passwordResetProperties.enabled()) {
            log.warn("Ignoring password reset request because password reset email is disabled");
            return;
        }

        String normalizedEmail = normalizeEmail(email);
        UserAccount user = userAccountRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);
        if (user == null) {
            return;
        }

        Instant now = Instant.now();
        invalidateActiveTokens(user.getId(), now);

        RawPasswordResetToken rawToken = generateToken();
        passwordResetTokenRepository.save(new PasswordResetToken(
                UUID.randomUUID(),
                user.getId(),
                rawToken.hash(),
                now,
                now.plus(passwordResetProperties.tokenTtl()),
                null
        ));
        eventPublisher.publishEvent(new PasswordResetRequestedEvent(user.getEmail(), rawToken.rawValue()));
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        String normalizedToken = normalizeToken(token);
        Instant now = Instant.now();

        PasswordResetToken passwordResetToken = passwordResetTokenRepository.findByTokenHashForUpdate(hashToken(normalizedToken))
                .orElseThrow(this::invalidTokenException);
        if (!passwordResetToken.isUsableAt(now)) {
            throw invalidTokenException();
        }

        UserAccount user = userAccountRepository.findById(passwordResetToken.getUserId())
                .orElseThrow(this::invalidTokenException);
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password must be different from current password");
        }

        passwordPolicyService.validatePassword(user.getUsername(), user.getDisplayName(), newPassword);
        user.updatePasswordHash(passwordEncoder.encode(newPassword));
        userAccountRepository.save(user);

        invalidateActiveTokens(user.getId(), now);
        revokeAllSessions(user, now);
    }

    private void invalidateActiveTokens(UUID userId, Instant usedAt) {
        passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(userId)
                .forEach(token -> token.markUsed(usedAt));
    }

    private void revokeAllSessions(UserAccount user, Instant now) {
        userSessionRepository.findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(user.getId())
                .forEach(session -> revokeSession(user, session, now));
    }

    private void revokeSession(UserAccount user, UserSession session, Instant now) {
        if (session.isRevoked()) {
            return;
        }

        session.revoke(now);
        userSessionRepository.save(session);
        eventPublisher.publishEvent(new SessionRevokedEvent(user.getUsername(), session.getId()));
    }

    private RawPasswordResetToken generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String rawValue = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new RawPasswordResetToken(rawValue, hashToken(rawValue));
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for password reset token hashing", exception);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeToken(String token) {
        return token.trim();
    }

    private ResponseStatusException invalidTokenException() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password reset token is invalid or expired");
    }

    private record RawPasswordResetToken(
            String rawValue,
            String hash
    ) {
    }
}
