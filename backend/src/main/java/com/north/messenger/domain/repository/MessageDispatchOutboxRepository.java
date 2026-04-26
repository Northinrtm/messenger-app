package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageDispatchOutboxRepository extends JpaRepository<MessageDispatchOutboxEntry, UUID> {

    List<MessageDispatchOutboxEntry> findAllByProcessedAtIsNullAndAvailableAtLessThanEqualOrderByCreatedAtAsc(
            Instant availableAt,
            Pageable pageable
    );

    @Query(
            value = """
                    select *
                    from message_dispatch_outbox
                    where processed_at is null
                      and available_at <= :availableAt
                    order by created_at asc
                    limit :limit
                    for update skip locked
                    """,
            nativeQuery = true
    )
    List<MessageDispatchOutboxEntry> lockDueEntriesForProcessing(
            @Param("availableAt") Instant availableAt,
            @Param("limit") int limit
    );
}
