package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatParticipant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, UUID> {

    List<ChatParticipant> findAllByUserIdOrderByJoinedAtAsc(UUID userId);

    List<ChatParticipant> findAllByChatIdOrderByJoinedAtAsc(UUID chatId);

    Optional<ChatParticipant> findByChatIdAndUserId(UUID chatId, UUID userId);

    boolean existsByChatIdAndUserId(UUID chatId, UUID userId);

    void deleteByChatIdAndUserId(UUID chatId, UUID userId);
}

