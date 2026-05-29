package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Entity
@Table(name = "user_chat_reaction_attentions")
public class UserChatReactionAttention {

    private static final int MAX_TRACKED_MESSAGES = 20;

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "message_id")
    private UUID messageId;

    @Column(name = "message_ids", nullable = false)
    private String messageIds = "";

    protected UserChatReactionAttention() {
    }

    public UserChatReactionAttention(UUID id, UUID userId, UUID chatId, Instant updatedAt) {
        this.id = id;
        this.userId = userId;
        this.chatId = chatId;
        this.updatedAt = updatedAt;
        this.messageIds = "";
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public List<UUID> getMessageIdList() {
        if (messageIds == null || messageIds.isBlank()) {
            return messageId != null ? List.of(messageId) : List.of();
        }
        return Arrays.stream(messageIds.split(","))
                .filter(s -> !s.isBlank())
                .map(UUID::fromString)
                .collect(Collectors.toList());
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant updatedAt, UUID newMessageId) {
        this.updatedAt = updatedAt;
        this.messageId = newMessageId;

        List<UUID> current = new ArrayList<>(getMessageIdList());
        if (!current.contains(newMessageId)) {
            if (current.size() >= MAX_TRACKED_MESSAGES) {
                current.remove(0);
            }
            current.add(newMessageId);
        }
        this.messageIds = current.stream().map(UUID::toString).collect(Collectors.joining(","));
    }
}
