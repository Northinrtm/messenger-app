package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "chat_history_backfill_status")
public class ChatHistoryBackfillStatus {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "recipient_user_id", nullable = false)
    private UUID recipientUserId;

    @Column(name = "primary_grantor_user_id")
    private UUID primaryGrantorUserId;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    @Column(name = "required_history_key_count", nullable = false)
    private int requiredHistoryKeyCount;

    @Column(name = "granted_history_key_count", nullable = false)
    private int grantedHistoryKeyCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 24)
    private ChatHistoryBackfillState state;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ChatHistoryBackfillStatus() {
    }

    public ChatHistoryBackfillStatus(
            UUID id,
            UUID chatId,
            UUID recipientUserId,
            UUID primaryGrantorUserId,
            Instant joinedAt,
            int requiredHistoryKeyCount,
            int grantedHistoryKeyCount,
            ChatHistoryBackfillState state,
            Instant completedAt,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.recipientUserId = recipientUserId;
        this.primaryGrantorUserId = primaryGrantorUserId;
        this.joinedAt = joinedAt;
        this.requiredHistoryKeyCount = requiredHistoryKeyCount;
        this.grantedHistoryKeyCount = grantedHistoryKeyCount;
        this.state = state;
        this.completedAt = completedAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getRecipientUserId() {
        return recipientUserId;
    }

    public UUID getPrimaryGrantorUserId() {
        return primaryGrantorUserId;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public int getRequiredHistoryKeyCount() {
        return requiredHistoryKeyCount;
    }

    public int getGrantedHistoryKeyCount() {
        return grantedHistoryKeyCount;
    }

    public ChatHistoryBackfillState getState() {
        return state;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean updateCoverage(
            UUID primaryGrantorUserId,
            int requiredHistoryKeyCount,
            int grantedHistoryKeyCount,
            Instant updatedAt
    ) {
        ChatHistoryBackfillState nextState = resolveState(requiredHistoryKeyCount, grantedHistoryKeyCount);
        Instant nextCompletedAt = nextState == ChatHistoryBackfillState.COMPLETE ? updatedAt : null;
        if (Objects.equals(this.primaryGrantorUserId, primaryGrantorUserId)
                && this.requiredHistoryKeyCount == requiredHistoryKeyCount
                && this.grantedHistoryKeyCount == grantedHistoryKeyCount
                && this.state == nextState
                && Objects.equals(this.completedAt, nextCompletedAt)) {
            return false;
        }

        this.primaryGrantorUserId = primaryGrantorUserId;
        this.requiredHistoryKeyCount = requiredHistoryKeyCount;
        this.grantedHistoryKeyCount = grantedHistoryKeyCount;
        this.state = nextState;
        this.completedAt = nextCompletedAt;
        this.updatedAt = updatedAt;
        return true;
    }

    public static ChatHistoryBackfillState resolveState(int requiredHistoryKeyCount, int grantedHistoryKeyCount) {
        if (requiredHistoryKeyCount <= 0 || grantedHistoryKeyCount >= requiredHistoryKeyCount) {
            return ChatHistoryBackfillState.COMPLETE;
        }
        if (grantedHistoryKeyCount <= 0) {
            return ChatHistoryBackfillState.PENDING;
        }
        return ChatHistoryBackfillState.PARTIAL;
    }
}
