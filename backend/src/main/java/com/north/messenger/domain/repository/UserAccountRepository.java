package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserAccount;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByDisplayNameIgnoreCase(String displayName);

    boolean existsByDisplayNameIgnoreCaseAndIdNot(String displayName, UUID id);

    List<UserAccount> findAllByIdIn(Collection<UUID> ids);

    @Query("""
            select user
            from UserAccount user
            where user.id <> :excludeUserId
              and (
                lower(user.username) like lower(concat('%', :query, '%'))
                or lower(user.displayName) like lower(concat('%', :query, '%'))
              )
            order by user.displayName asc, user.username asc
            """)
    List<UserAccount> searchByUsernameOrDisplayName(
            @Param("excludeUserId") UUID excludeUserId,
            @Param("query") String query,
            Pageable pageable
    );
}
