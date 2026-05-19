package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.EmailChangeToken;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailChangeTokenRepository extends JpaRepository<EmailChangeToken, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select token
            from EmailChangeToken token
            where token.tokenHash = :tokenHash
            """)
    Optional<EmailChangeToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    List<EmailChangeToken> findAllByUserIdAndUsedAtIsNull(UUID userId);
}
