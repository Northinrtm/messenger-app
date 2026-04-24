package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserSession;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select session
            from UserSession session
            where session.id = :sessionId
            """)
    Optional<UserSession> findByIdForUpdate(@Param("sessionId") UUID sessionId);

    List<UserSession> findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(UUID userId);

    List<UserSession> findAllByUserIdInAndRevokedAtIsNullAndExpiresAtAfter(
            Collection<UUID> userIds,
            Instant expiresAfter
    );

    @Query("""
            select session
            from UserSession session
            where session.userId in :userIds
              and session.revokedAt is null
              and session.expiresAt > :now
              and session.lastUsedAt > :activeAfter
            """)
    List<UserSession> findAllActiveByUserIdIn(
            @Param("userIds") Collection<UUID> userIds,
            @Param("now") Instant now,
            @Param("activeAfter") Instant activeAfter
    );

    @Query("""
            select session.id
            from UserSession session
            where session.userId = :userId
              and session.id in :sessionIds
              and session.revokedAt is null
              and session.expiresAt > :now
            """)
    List<UUID> findValidIdsByUserIdAndIdIn(
            @Param("userId") UUID userId,
            @Param("sessionIds") Collection<UUID> sessionIds,
            @Param("now") Instant now
    );

    @Query("""
            select session.id
            from UserSession session
            where session.userId = :userId
              and session.id in :sessionIds
              and session.revokedAt is null
              and session.expiresAt > :now
              and session.lastUsedAt > :activeAfter
            """)
    List<UUID> findActiveIdsByUserIdAndIdIn(
            @Param("userId") UUID userId,
            @Param("sessionIds") Collection<UUID> sessionIds,
            @Param("now") Instant now,
            @Param("activeAfter") Instant activeAfter
    );

    boolean existsByUserIdAndRevokedAtIsNullAndExpiresAtAfterAndLastUsedAtAfter(
            UUID userId,
            Instant expiresAfter,
            Instant activeAfter
    );

    boolean existsByIdAndUserIdAndRevokedAtIsNullAndExpiresAtAfter(
            UUID id,
            UUID userId,
            Instant expiresAfter
    );

    boolean existsByIdAndUserIdAndRevokedAtIsNullAndExpiresAtAfterAndLastUsedAtAfter(
            UUID id,
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
