package com.north.messenger.application.auth;

import com.north.messenger.application.mail.MailProperties;
import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserMailboxServiceTest {

    private AuthService authService;
    private UserMailboxService userMailboxService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
    }

    @Test
    void listOwnMailboxesShouldReturnBuiltInMailboxWhenMailEnabled() {
        MailProperties props = new MailProperties(true, "ktsf.ru", "http://stalwart", "secret", "stalwart", 143, "stalwart", 25, "cred-secret");
        userMailboxService = new UserMailboxService(authService, Optional.of(props));

        UserAccount user = userAccount("north");
        when(authService.requireAuthenticatedUser("north")).thenReturn(user);

        var result = userMailboxService.listOwnMailboxes("north");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).email()).isEqualTo("north@ktsf.ru");
    }

    @Test
    void listOwnMailboxesShouldReturnEmptyWhenMailDisabled() {
        MailProperties props = new MailProperties(false, "ktsf.ru", "http://stalwart", "secret", "stalwart", 143, "stalwart", 25, "cred-secret");
        userMailboxService = new UserMailboxService(authService, Optional.of(props));

        var result = userMailboxService.listOwnMailboxes("north");

        assertThat(result).isEmpty();
    }

    @Test
    void listOwnMailboxesShouldReturnEmptyWhenMailNotConfigured() {
        userMailboxService = new UserMailboxService(authService, Optional.empty());

        var result = userMailboxService.listOwnMailboxes("north");

        assertThat(result).isEmpty();
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
