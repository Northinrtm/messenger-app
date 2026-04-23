package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageDispatchOutboxRepository extends JpaRepository<MessageDispatchOutboxEntry, UUID> {

    List<MessageDispatchOutboxEntry> findAllByProcessedAtIsNullAndAvailableAtLessThanEqualOrderByCreatedAtAsc(
            Instant availableAt,
            Pageable pageable
    );
}
