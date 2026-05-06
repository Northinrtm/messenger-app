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
        this(id, username, email, displayName, profession, avatarUrl, passwordHash, 1L, createdAt, createdAt);
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
        this(id, username, email, displayName, profession, avatarUrl, passwordHash, 1L, createdAt, emailVerifiedAt);
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
        this.id = id;
        this.username = username;
        this.email = normalizeRequiredEmail(email);
        this.displayName = displayName;
        this.profession = profession;
        this.avatarUrl = avatarUrl;
        this.passwordHash = passwordHash;
        this.passwordVersion = Math.max(1L, passwordVersion);
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
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

    public void markEmailVerified(Instant emailVerifiedAt) {
        this.emailVerifiedAt = emailVerifiedAt;
    }

    private static String normalizeRequiredEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email must not be blank");
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
