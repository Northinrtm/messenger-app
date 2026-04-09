package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class UserAccount {

    @Id
    private UUID id;

    @Column(name = "username", nullable = false, unique = true, length = 24)
    private String username;

    @Column(name = "display_name", nullable = false, length = 40)
    private String displayName;

    @Column(name = "profession", length = 80)
    private String profession;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserAccount() {
    }

    public UserAccount(UUID id, String username, String displayName, String passwordHash, Instant createdAt) {
        this(id, username, displayName, null, null, passwordHash, createdAt);
    }

    public UserAccount(
            UUID id,
            String username,
            String displayName,
            String profession,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        this.id = id;
        this.username = username;
        this.displayName = displayName;
        this.profession = profession;
        this.avatarUrl = avatarUrl;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public UserAccount(
            UUID id,
            String username,
            String displayName,
            String avatarUrl,
            String passwordHash,
            Instant createdAt
    ) {
        this(id, username, displayName, null, avatarUrl, passwordHash, createdAt);
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
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

    public Instant getCreatedAt() {
        return createdAt;
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

    public void updatePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }
}
