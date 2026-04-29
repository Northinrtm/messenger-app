package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_participants")
public class ChatParticipant {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @Column(name = "prejoin_history_access_granted_at")
    private Instant prejoinHistoryAccessGrantedAt;

    protected ChatParticipant() {
    }

    public ChatParticipant(UUID id, UUID chatId, UUID userId, Instant joinedAt) {
        this(id, chatId, userId, joinedAt, null);
    }

    public ChatParticipant(
            UUID id,
            UUID chatId,
            UUID userId,
            Instant joinedAt,
            Instant prejoinHistoryAccessGrantedAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.userId = userId;
        this.joinedAt = joinedAt;
        this.prejoinHistoryAccessGrantedAt = prejoinHistoryAccessGrantedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public Instant getPrejoinHistoryAccessGrantedAt() {
        return prejoinHistoryAccessGrantedAt;
    }

    public void grantPrejoinHistoryAccess(Instant grantedAt) {
        this.prejoinHistoryAccessGrantedAt = grantedAt;
    }
}

