package com.north.messenger.application.auth;

import com.north.messenger.domain.model.EmailVerificationToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.EmailVerificationTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class EmailVerificationService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final UserAccountRepository userAccountRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final EmailVerificationProperties emailVerificationProperties;
    private final ApplicationEventPublisher eventPublisher;

    public EmailVerificationService(
            UserAccountRepository userAccountRepository,
            EmailVerificationTokenRepository emailVerificationTokenRepository,
            EmailVerificationProperties emailVerificationProperties,
            ApplicationEventPublisher eventPublisher
    ) {
        this.userAccountRepository = userAccountRepository;
        this.emailVerificationTokenRepository = emailVerificationTokenRepository;
        this.emailVerificationProperties = emailVerificationProperties;
        this.eventPublisher = eventPublisher;
    }

    public boolean isEnabled() {
        return emailVerificationProperties.enabled();
    }

    @Transactional
    public void issueVerificationForRegisteredUser(UserAccount user) {
        if (!emailVerificationProperties.enabled()) {
            return;
        }

        issueFreshToken(user, Instant.now());
    }

    @Transactional
    public void resendVerificationEmail(String email) {
        if (!emailVerificationProperties.enabled()) {
            return;
        }

        String normalizedEmail = normalizeEmail(email);
        UserAccount user = userAccountRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);
        if (user == null || user.isEmailVerified()) {
            return;
        }

        issueFreshToken(user, Instant.now());
    }

    @Transactional
    public void resendVerificationEmailForAuthenticatedUser(String username) {
        if (!emailVerificationProperties.enabled()) {
            return;
        }

        UserAccount user = userAccountRepository.findByUsernameIgnoreCase(normalizeUsername(username))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
        if (user.isEmailVerified()) {
            throw alreadyVerifiedException();
        }

        issueFreshToken(user, Instant.now());
    }

    @Transactional
    public void verifyEmail(String token) {
        String normalizedToken = normalizeToken(token);
        Instant now = Instant.now();

        EmailVerificationToken emailVerificationToken = emailVerificationTokenRepository.findByTokenHashForUpdate(hashToken(normalizedToken))
                .orElseThrow(this::invalidTokenException);
        UserAccount user = userAccountRepository.findById(emailVerificationToken.getUserId())
                .orElseThrow(this::invalidTokenException);

        if (user.isEmailVerified()) {
            invalidateActiveTokens(user.getId(), now);
            throw alreadyVerifiedException();
        }
        if (emailVerificationToken.getUsedAt() != null) {
            throw invalidTokenException();
        }
        if (!emailVerificationToken.isUsableAt(now)) {
            throw expiredTokenException();
        }

        user.markEmailVerified(now);
        userAccountRepository.save(user);
        invalidateActiveTokens(user.getId(), now);
    }

    private void issueFreshToken(UserAccount user, Instant now) {
        invalidateActiveTokens(user.getId(), now);

        RawEmailVerificationToken rawToken = generateToken();
        emailVerificationTokenRepository.save(new EmailVerificationToken(
                UUID.randomUUID(),
                user.getId(),
                rawToken.hash(),
                now,
                now.plus(emailVerificationProperties.tokenTtl()),
                null
        ));
        eventPublisher.publishEvent(new EmailVerificationRequestedEvent(user.getEmail(), rawToken.rawValue()));
    }

    private void invalidateActiveTokens(UUID userId, Instant usedAt) {
        emailVerificationTokenRepository.findAllByUserIdAndUsedAtIsNull(userId)
                .forEach(token -> token.markUsed(usedAt));
    }

    private RawEmailVerificationToken generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String rawValue = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new RawEmailVerificationToken(rawValue, hashToken(rawValue));
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for email verification token hashing", exception);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeToken(String token) {
        return token.trim();
    }

    private ResponseStatusException invalidTokenException() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email verification token is invalid");
    }

    private ResponseStatusException expiredTokenException() {
        return new ResponseStatusException(HttpStatus.GONE, "Email verification token is expired");
    }

    private ResponseStatusException alreadyVerifiedException() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Email is already verified");
    }

    private record RawEmailVerificationToken(
            String rawValue,
            String hash
    ) {
    }
}
