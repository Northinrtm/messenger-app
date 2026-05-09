package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class UserAccountRepositoryTest {

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Test
    void searchByUsernameOrDisplayNameShouldPreferExactThenPrefixThenPartialMatches() {
        UserAccount excludedUser = persistUser("me", "me@example.com", "Me");
        UserAccount partialMatch = persistUser("silentnorth", "silentnorth@example.com", "Silent North");
        UserAccount prefixMatch = persistUser("northwind", "northwind@example.com", "Northwind");
        UserAccount exactMatch = persistUser("north", "north@example.com", "North");

        List<UserAccount> results = userAccountRepository.searchByUsernameOrDisplayName(
                excludedUser.getId(),
                "north",
                org.springframework.data.domain.PageRequest.of(0, 8)
        );

        assertThat(results)
                .extracting(UserAccount::getId)
                .containsExactly(exactMatch.getId(), prefixMatch.getId(), partialMatch.getId());
    }

    private UserAccount persistUser(String username, String email, String displayName) {
        return userAccountRepository.save(new UserAccount(
                UUID.randomUUID(),
                username,
                email,
                displayName,
                null,
                null,
                "password-hash",
                Instant.parse("2026-05-09T08:00:00Z")
        ));
    }
}
