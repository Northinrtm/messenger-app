package com.north.messenger.domain.model;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

public class ChatMessageRecipientPayloadId implements Serializable {

    private UUID messageId;
    private UUID recipientDeviceId;

    public ChatMessageRecipientPayloadId() {
    }

    public ChatMessageRecipientPayloadId(UUID messageId, UUID recipientDeviceId) {
        this.messageId = messageId;
        this.recipientDeviceId = recipientDeviceId;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public UUID getRecipientDeviceId() {
        return recipientDeviceId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof ChatMessageRecipientPayloadId that)) {
            return false;
        }
        return Objects.equals(messageId, that.messageId)
                && Objects.equals(recipientDeviceId, that.recipientDeviceId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messageId, recipientDeviceId);
    }
}
