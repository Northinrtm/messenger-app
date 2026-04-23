package com.north.messenger.domain.model;

import com.north.messenger.application.message.MessageDispatchEvent;
import com.north.messenger.application.message.MessageDispatchMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "message_dispatch_outbox")
public class MessageDispatchOutboxEntry {

    private static final int MAX_ERROR_LENGTH = 2_000;

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false, updatable = false)
    private UUID chatId;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "client_message_id", length = 255)
    private String clientMessageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "dispatch_mode", nullable = false, updatable = false, length = 32)
    private MessageDispatchMode dispatchMode;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "available_at", nullable = false)
    private Instant availableAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_error", length = MAX_ERROR_LENGTH)
    private String lastError;

    protected MessageDispatchOutboxEntry() {
    }

    public MessageDispatchOutboxEntry(UUID id, MessageDispatchEvent event, Instant createdAt) {
        this.id = id;
        this.chatId = event.chatId();
        this.messageId = event.messageId();
        this.clientMessageId = event.clientMessageId();
        this.dispatchMode = event.mode();
        this.createdAt = createdAt;
        this.availableAt = createdAt;
        this.attemptCount = 0;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public MessageDispatchMode getDispatchMode() {
        return dispatchMode;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public Instant getAvailableAt() {
        return availableAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getLastError() {
        return lastError;
    }

    public MessageDispatchEvent toEvent() {
        return new MessageDispatchEvent(chatId, messageId, clientMessageId, dispatchMode);
    }

    public void markProcessed(Instant processedAt) {
        this.attemptCount += 1;
        this.processedAt = processedAt;
        this.availableAt = processedAt;
        this.lastError = null;
    }

    public void markFailed(Instant nextAvailableAt, String error) {
        this.attemptCount += 1;
        this.availableAt = nextAvailableAt;
        this.lastError = abbreviate(error);
    }

    private String abbreviate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() <= MAX_ERROR_LENGTH) {
            return value;
        }
        return value.substring(0, MAX_ERROR_LENGTH);
    }
}
