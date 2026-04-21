package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserPushSubscription;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPushSubscriptionRepository extends JpaRepository<UserPushSubscription, UUID> {

    Optional<UserPushSubscription> findByEndpoint(String endpoint);

    List<UserPushSubscription> findAllByUserIdIn(Collection<UUID> userIds);

    void deleteByEndpointAndUserId(String endpoint, UUID userId);

    void deleteByEndpoint(String endpoint);
}
