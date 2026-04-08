package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.InviteLink;
import com.north.messenger.domain.model.InviteLinkTargetType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InviteLinkRepository extends JpaRepository<InviteLink, UUID> {

    Optional<InviteLink> findByCode(String code);

    Optional<InviteLink> findByTargetTypeAndTargetId(InviteLinkTargetType targetType, UUID targetId);

    boolean existsByCode(String code);
}
