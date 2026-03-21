package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserAccount;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    List<UserAccount> findAllByIdIn(Collection<UUID> ids);
}

