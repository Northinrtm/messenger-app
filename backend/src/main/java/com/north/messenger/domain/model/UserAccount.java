package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class UserAccount {

    public static final String DELETED_USERNAME_PREFIX = "deleted:";

    @Id
    private UUID id;

    @Column(name = "username", nullable = false, unique = true, length = 24)
    private String username;

    @Column(name = "email", nullable = false, length = 320)
    private String email;

    @Column(name = "display_name", nullable = false, length = 40)
    private String displayName;

    @Column(name = "profession", length = 160)
    private String profession;

    @Column(name = "avatar_url", columnDefinition = "text")
    private String avatarUrl;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "password_version", nullable = false)
    private long passwordVersion;

    @Column(name = "mail_enabled", nullable = false)
    private boolean mailEnabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    protected UserAccount() {
    }

    public UserAccount(
            UUID id,
            String username,
            String email,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        this(id, username, email, displayName, profession, avatarUrl, passwordHash, 1L, true, createdAt, createdAt);
    }

    public UserAccount(
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
        this(id, username, email, displayName, profession, avatarUrl, passwordHash, 1L, true, createdAt, emailVerifiedAt);
    }

    public UserAccount(
            UUID id,
            String username,
            String email,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            long passwordVersion,
            Instant createdAt,
            Instant emailVerifiedAt
    ) {
        this(id, username, email, displayName, profession, avatarUrl, passwordHash, passwordVersion, true, createdAt, emailVerifiedAt);
    }

    public UserAccount(
            UUID id,
            String username,
            String email,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            long passwordVersion,
            boolean mailEnabled,
            Instant createdAt,
            Instant emailVerifiedAt
    ) {
        this.id = id;
        this.username = username;
        this.email = normalizeRequiredEmail(email);
        this.displayName = displayName;
        this.profession = profession;
        this.avatarUrl = avatarUrl;
        this.passwordHash = passwordHash;
        this.passwordVersion = Math.max(1L, passwordVersion);
        this.mailEnabled = mailEnabled;
        this.createdAt = createdAt;
        this.emailVerifiedAt = emailVerifiedAt;
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public String getProfession() {
        return profession;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public long getPasswordVersion() {
        return passwordVersion;
    }

    public boolean isMailEnabled() {
        return mailEnabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public void updateUsername(String username) {
        this.username = username;
    }

    public void updateDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void updateProfession(String profession) {
        this.profession = profession;
    }

    public void updateAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public void updateEmail(String email) {
        this.email = normalizeRequiredEmail(email);
    }

    public void updatePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public long advancePasswordVersion() {
        this.passwordVersion = Math.max(1L, this.passwordVersion + 1L);
        return this.passwordVersion;
    }

    public void updateMailEnabled(boolean mailEnabled) {
        this.mailEnabled = mailEnabled;
    }

    public void markEmailVerified(Instant emailVerifiedAt) {
        this.emailVerifiedAt = emailVerifiedAt;
    }

    public void markDeleted(
            String username,
            String email,
            String displayName,
            String passwordHash
    ) {
        this.username = username;
        this.email = normalizeRequiredEmail(email);
        this.displayName = displayName;
        this.profession = null;
        this.avatarUrl = null;
        this.passwordHash = passwordHash;
        this.mailEnabled = false;
        this.emailVerifiedAt = null;
    }

    public boolean isDeletedAccount() {
        return username != null && username.startsWith(DELETED_USERNAME_PREFIX);
    }

    private static String normalizeRequiredEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email must not be blank");
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
