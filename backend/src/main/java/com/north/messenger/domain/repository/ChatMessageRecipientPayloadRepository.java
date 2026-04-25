package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessageRecipientPayload;
import com.north.messenger.domain.model.ChatMessageRecipientPayloadId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRecipientPayloadRepository
        extends JpaRepository<ChatMessageRecipientPayload, ChatMessageRecipientPayloadId> {

    List<ChatMessageRecipientPayload> findAllByMessageIdIn(Collection<UUID> messageIds);

    List<ChatMessageRecipientPayload> findAllByMessageIdInAndRecipientUserId(
            Collection<UUID> messageIds,
            UUID recipientUserId
    );

    void deleteAllByMessageId(UUID messageId);
}
