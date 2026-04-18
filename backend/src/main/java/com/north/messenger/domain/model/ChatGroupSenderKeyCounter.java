package com.north.messenger.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_group_sender_key_counters")
public class ChatGroupSenderKeyCounter {

    @Id
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "sender_device_id", nullable = false)
    private UUID senderDeviceId;

    @Column(name = "sender_key_id", nullable = false, columnDefinition = "text")
    private String senderKeyId;

    @Column(name = "last_message_counter", nullable = false)
    private int lastMessageCounter;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ChatGroupSenderKeyCounter() {
    }

    public ChatGroupSenderKeyCounter(
            UUID id,
            UUID chatId,
            UUID senderDeviceId,
            String senderKeyId,
            int lastMessageCounter,
            Instant updatedAt
    ) {
        this.id = id;
        this.chatId = chatId;
        this.senderDeviceId = senderDeviceId;
        this.senderKeyId = senderKeyId;
        this.lastMessageCounter = lastMessageCounter;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getChatId() {
        return chatId;
    }

    public UUID getSenderDeviceId() {
        return senderDeviceId;
    }

    public String getSenderKeyId() {
        return senderKeyId;
    }

    public int getLastMessageCounter() {
        return lastMessageCounter;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void advanceTo(int messageCounter, Instant updatedAt) {
        this.lastMessageCounter = messageCounter;
        this.updatedAt = updatedAt;
    }
}
