package com.north.messenger.application.auth;

import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserMailbox;
import com.north.messenger.domain.repository.UserMailboxRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserMailboxServiceTest {

    private AuthService authService;
    private UserMailboxRepository userMailboxRepository;
    private UserMailboxService userMailboxService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        userMailboxRepository = mock(UserMailboxRepository.class);
        userMailboxService = new UserMailboxService(authService, userMailboxRepository);
    }

    @Test
    void addOwnMailboxShouldNormalizeAndPersistEmail() {
        UserAccount user = userAccount("north");
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userMailboxRepository.existsByUserIdAndEmail(user.getId(), "north@example.com")).thenReturn(false);
        when(userMailboxRepository.save(any(UserMailbox.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = userMailboxService.addOwnMailbox("north", " North@Example.com ");

        assertThat(response.email()).isEqualTo("north@example.com");
        verify(userMailboxRepository).save(any(UserMailbox.class));
    }

    @Test
    void addOwnMailboxShouldRejectDuplicateMailbox() {
        UserAccount user = userAccount("north");
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userMailboxRepository.existsByUserIdAndEmail(user.getId(), "north@example.com")).thenReturn(true);

        assertThatThrownBy(() -> userMailboxService.addOwnMailbox("north", "north@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(responseStatusException.getReason()).isEqualTo("Mailbox is already added");
                });
    }

    @Test
    void removeOwnMailboxShouldDeleteOnlyOwnedMailbox() {
        UserAccount user = userAccount("north");
        UserMailbox mailbox = new UserMailbox(
                UUID.randomUUID(),
                user.getId(),
                "north@example.com",
                Instant.parse("2026-05-09T09:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userMailboxRepository.findByIdAndUserId(mailbox.getId(), user.getId())).thenReturn(Optional.of(mailbox));

        userMailboxService.removeOwnMailbox("north", mailbox.getId());

        verify(userMailboxRepository).delete(mailbox);
    }

    @Test
    void listOwnMailboxesShouldReturnRepositoryResults() {
        UserAccount user = userAccount("north");
        UserMailbox mailbox = new UserMailbox(
                UUID.randomUUID(),
                user.getId(),
                "north@example.com",
                Instant.parse("2026-05-09T09:00:00Z")
        );
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userMailboxRepository.findAllByUserIdOrderByCreatedAtDesc(user.getId())).thenReturn(List.of(mailbox));

        var response = userMailboxService.listOwnMailboxes("north");

        assertThat(response).hasSize(1);
        assertThat(response.get(0).email()).isEqualTo("north@example.com");
    }

    private UserAccount userAccount(String username) {
        return testUserAccount(
                UUID.randomUUID(),
                username,
                "North",
                "password-hash",
                Instant.now().minusSeconds(3_600)
        );
    }
}
