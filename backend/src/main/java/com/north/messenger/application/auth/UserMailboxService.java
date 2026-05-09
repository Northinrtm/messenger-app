package com.north.messenger.application.auth;

import com.north.messenger.api.dto.UserMailboxResponse;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserMailbox;
import com.north.messenger.domain.repository.UserMailboxRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class UserMailboxService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
    );

    private final AuthService authService;
    private final UserMailboxRepository userMailboxRepository;

    public UserMailboxService(AuthService authService, UserMailboxRepository userMailboxRepository) {
        this.authService = authService;
        this.userMailboxRepository = userMailboxRepository;
    }

    public List<UserMailboxResponse> listOwnMailboxes(String username) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        return userMailboxRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public UserMailboxResponse addOwnMailbox(String username, String email) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        String normalizedEmail = normalizeEmail(email);
        validateEmail(normalizedEmail);
        if (userMailboxRepository.existsByUserIdAndEmail(currentUser.getId(), normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mailbox is already added");
        }

        UserMailbox mailbox = userMailboxRepository.save(new UserMailbox(
                UUID.randomUUID(),
                currentUser.getId(),
                normalizedEmail,
                Instant.now()
        ));
        return toResponse(mailbox);
    }

    @Transactional
    public void removeOwnMailbox(String username, UUID mailboxId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        userMailboxRepository.findByIdAndUserId(mailboxId, currentUser.getId())
                .ifPresent(userMailboxRepository::delete);
    }

    private UserMailboxResponse toResponse(UserMailbox mailbox) {
        return new UserMailboxResponse(
                mailbox.getId(),
                mailbox.getEmail(),
                mailbox.getCreatedAt()
        );
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            return "";
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private void validateEmail(String email) {
        if (email.isBlank() || email.length() > 320 || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email must use a valid address format");
        }
    }
}
