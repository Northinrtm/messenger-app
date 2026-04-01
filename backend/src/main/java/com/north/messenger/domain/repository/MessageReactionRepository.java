package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.MessageReaction;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageReactionRepository extends JpaRepository<MessageReaction, UUID> {

    List<MessageReaction> findAllByMessageIdIn(Collection<UUID> messageIds);

    Optional<MessageReaction> findByMessageIdAndUserIdAndReactionKey(UUID messageId, UUID userId, String reactionKey);
}
