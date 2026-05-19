package com.north.messenger.application.auth;

import com.north.messenger.domain.model.EmailChangeToken;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.EmailChangeTokenRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class EmailChangeService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
    );

    private final UserAccountRepository userAccountRepository;
    private final EmailChangeTokenRepository emailChangeTokenRepository;
    private final EmailChangeProperties emailChangeProperties;
    private final ApplicationEventPublisher eventPublisher;
    private final EmailChangeEmailSender emailChangeEmailSender;
    private final Set<String> allowedEmailDomains;

    public EmailChangeService(
            UserAccountRepository userAccountRepository,
            EmailChangeTokenRepository emailChangeTokenRepository,
            EmailChangeProperties emailChangeProperties,
            ApplicationEventPublisher eventPublisher,
            EmailChangeEmailSender emailChangeEmailSender,
            @Value("${app.auth.registration.allowed-email-domains:gmail.com,googlemail.com,outlook.com,hotmail.com,live.com,msn.com,yahoo.com,yahoo.co.uk,yahoo.co.jp,icloud.com,me.com,mac.com,yandex.ru,yandex.com,ya.ru,mail.ru,bk.ru,inbox.ru,list.ru,rambler.ru,lenta.ru,myrambler.ru,autorambler.ru,proton.me,protonmail.com,pm.me,aol.com,gmx.com,gmx.de,gmx.net,fastmail.com,zoho.com}") String[] allowedEmailDomains
    ) {
        this.userAccountRepository = userAccountRepository;
        this.emailChangeTokenRepository = emailChangeTokenRepository;
        this.emailChangeProperties = emailChangeProperties;
        this.eventPublisher = eventPublisher;
        this.emailChangeEmailSender = emailChangeEmailSender;
        this.allowedEmailDomains = Arrays.stream(allowedEmailDomains)
                .map(d -> d == null ? "" : d.trim().toLowerCase(Locale.ROOT))
                .filter(d -> !d.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean isEnabled() {
        return emailChangeProperties.enabled();
    }

    @Transactional
    public void requestEmailChange(String username, String newEmail) {
        if (!emailChangeProperties.enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Email change is not available");
        }

        String normalizedEmail = normalizeEmail(newEmail);
        validateEmailFormat(normalizedEmail);
        validateEmailDomain(normalizedEmail);

        UserAccount user = userAccountRepository.findByUsernameIgnoreCase(normalizeUsername(username))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));

        if (normalizedEmail.equals(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "New email must be different from the current email");
        }

        if (userAccountRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }

        issueFreshToken(user, normalizedEmail, Instant.now());
    }

    @Transactional
    public void confirmEmailChange(String token) {
        String normalizedToken = token.trim();
        Instant now = Instant.now();

        EmailChangeToken changeToken = emailChangeTokenRepository.findByTokenHashForUpdate(hashToken(normalizedToken))
                .orElseThrow(this::invalidTokenException);
        UserAccount user = userAccountRepository.findById(changeToken.getUserId())
                .orElseThrow(this::invalidTokenException);

        if (changeToken.getUsedAt() != null) {
            throw invalidTokenException();
        }
        if (!changeToken.isUsableAt(now)) {
            throw expiredTokenException();
        }

        String pendingEmail = changeToken.getPendingEmail();
        if (userAccountRepository.existsByEmailIgnoreCase(pendingEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }

        user.updateEmail(pendingEmail);
        user.markEmailVerified(now);
        userAccountRepository.save(user);
        invalidateActiveTokens(user.getId(), now);
    }

    private void issueFreshToken(UserAccount user, String pendingEmail, Instant now) {
        invalidateActiveTokens(user.getId(), now);

        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String rawValue = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash = hashToken(rawValue);

        emailChangeTokenRepository.save(new EmailChangeToken(
                UUID.randomUUID(),
                user.getId(),
                pendingEmail,
                hash,
                now,
                now.plus(emailChangeProperties.tokenTtl()),
                null
        ));

        eventPublisher.publishEvent(new EmailChangeRequestedEvent(pendingEmail, rawValue));
    }

    private void invalidateActiveTokens(UUID userId, Instant usedAt) {
        emailChangeTokenRepository.findAllByUserIdAndUsedAtIsNull(userId)
                .forEach(token -> token.markUsed(usedAt));
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for email change token hashing", exception);
        }
    }

    private void validateEmailFormat(String email) {
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email must use a valid address format");
        }
    }

    private void validateEmailDomain(String email) {
        int separatorIndex = email.lastIndexOf('@');
        if (separatorIndex < 0 || separatorIndex == email.length() - 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email must be valid");
        }
        String domain = email.substring(separatorIndex + 1);
        if (!allowedEmailDomains.isEmpty() && !allowedEmailDomains.contains(domain)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email domain is not supported");
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private ResponseStatusException invalidTokenException() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email change token is invalid");
    }

    private ResponseStatusException expiredTokenException() {
        return new ResponseStatusException(HttpStatus.GONE, "Email change token is expired");
    }
}
