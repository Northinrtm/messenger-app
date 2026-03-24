package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserChatDraft;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserChatDraftRepository extends JpaRepository<UserChatDraft, UUID> {

    List<UserChatDraft> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);

    Optional<UserChatDraft> findByUserIdAndChatId(UUID userId, UUID chatId);
}
