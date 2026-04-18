package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatGroupSenderKeyCounter;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface ChatGroupSenderKeyCounterRepository extends JpaRepository<ChatGroupSenderKeyCounter, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ChatGroupSenderKeyCounter> findByChatIdAndSenderDeviceIdAndSenderKeyId(
            UUID chatId,
            UUID senderDeviceId,
            String senderKeyId
    );
}
