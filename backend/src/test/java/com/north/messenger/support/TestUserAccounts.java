package com.north.messenger.support;

import com.north.messenger.domain.model.UserAccount;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public final class TestUserAccounts {

    private TestUserAccounts() {
    }

    public static UserAccount testUserAccount(
            UUID id,
            String username,
            String displayName,
            String passwordHash,
            Instant createdAt
    ) {
        return testUserAccount(id, username, defaultEmail(username), displayName, null, null, passwordHash, createdAt);
    }

    public static UserAccount testUserAccount(
            UUID id,
            String username,
            String displayName,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        return testUserAccount(id, username, defaultEmail(username), displayName, null, avatarUrl, passwordHash, createdAt);
    }

    public static UserAccount testUserAccount(
            UUID id,
            String username,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        return testUserAccount(id, username, defaultEmail(username), displayName, profession, avatarUrl, passwordHash, createdAt);
    }

    public static UserAccount testUserAccount(
            UUID id,
            String username,
            String email,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        return new UserAccount(id, username, email, displayName, profession, avatarUrl, passwordHash, createdAt);
    }

    public static UserAccount testUserAccount(
            UUID id,
            String username,
            String email,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            Instant createdAt,
            Instant emailVerifiedAt
    ) {
        return new UserAccount(id, username, email, displayName, profession, avatarUrl, passwordHash, createdAt, emailVerifiedAt);
    }

    private static String defaultEmail(String username) {
        return username.trim().toLowerCase(Locale.ROOT) + "@example.test";
    }
}
