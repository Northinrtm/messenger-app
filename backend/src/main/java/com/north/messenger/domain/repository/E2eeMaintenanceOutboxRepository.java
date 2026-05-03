package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.E2eeMaintenanceOutboxEntry;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface E2eeMaintenanceOutboxRepository extends JpaRepository<E2eeMaintenanceOutboxEntry, UUID> {

    Optional<E2eeMaintenanceOutboxEntry> findByDedupeKeyAndProcessedAtIsNull(String dedupeKey);

    long countByProcessedAtIsNull();

    long countByProcessedAtIsNullAndAvailableAtLessThanEqual(Instant availableAt);

    List<E2eeMaintenanceOutboxEntry> findAllByProcessedAtBeforeOrderByProcessedAtAsc(
            Instant processedBefore,
            Pageable pageable
    );

    @Query("""
            select min(entry.availableAt)
            from E2eeMaintenanceOutboxEntry entry
            where entry.processedAt is null
              and entry.availableAt <= :availableAt
            """)
    Instant findOldestDueAvailableAt(@Param("availableAt") Instant availableAt);

    @Query(
            value = """
                    select *
                    from e2ee_maintenance_outbox
                    where processed_at is null
                      and available_at <= :availableAt
                    order by created_at asc
                    limit :limit
                    for update skip locked
                    """,
            nativeQuery = true
    )
    List<E2eeMaintenanceOutboxEntry> lockDueEntriesForProcessing(
            @Param("availableAt") Instant availableAt,
            @Param("limit") int limit
    );
}
