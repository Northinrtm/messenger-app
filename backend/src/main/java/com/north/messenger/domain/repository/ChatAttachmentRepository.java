package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatAttachment;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatAttachmentRepository extends JpaRepository<ChatAttachment, UUID> {

    Optional<ChatAttachment> findByIdAndChatId(UUID id, UUID chatId);

    List<ChatAttachment> findAllByMessageId(UUID messageId);
}
