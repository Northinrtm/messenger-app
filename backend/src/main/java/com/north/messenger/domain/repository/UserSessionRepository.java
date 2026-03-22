package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserSession;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    List<UserSession> findAllByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(UUID userId);
}
