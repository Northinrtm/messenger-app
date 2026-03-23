package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserSession;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    List<UserSession> findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(UUID userId);

    boolean existsByUserIdAndRevokedAtIsNullAndExpiresAtAfterAndLastUsedAtAfter(
            UUID userId,
            Instant expiresAfter,
            Instant activeAfter
    );

    @Query("""
            select distinct session.userId
            from UserSession session
            where session.userId in :userIds
              and session.revokedAt is null
              and session.expiresAt > :now
              and session.lastUsedAt > :activeAfter
            """)
    List<UUID> findDistinctOnlineUserIdsByUserIdIn(
            @Param("userIds") Collection<UUID> userIds,
            @Param("now") Instant now,
            @Param("activeAfter") Instant activeAfter
    );
}
