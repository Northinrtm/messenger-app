package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserContact;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserContactRepository extends JpaRepository<UserContact, UUID> {

    List<UserContact> findAllByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<UserContact> findByUserIdAndContactUserId(UUID userId, UUID contactUserId);

    void deleteByUserIdAndContactUserId(UUID userId, UUID contactUserId);
}
