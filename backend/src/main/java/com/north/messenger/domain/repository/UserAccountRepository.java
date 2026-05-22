package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserAccount;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select user
            from UserAccount user
            where user.id = :userId
            """)
    Optional<UserAccount> findByIdForUpdate(@Param("userId") UUID userId);

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    Optional<UserAccount> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByDisplayNameIgnoreCase(String displayName);

    boolean existsByDisplayNameIgnoreCaseAndIdNot(String displayName, UUID id);

    List<UserAccount> findAllByIdIn(Collection<UUID> ids);

    @Query("""
            select user
            from UserAccount user
            where user.id <> :excludeUserId
              and lower(user.username) not like 'deleted:%'
              and (
                lower(user.username) like lower(concat('%', :query, '%'))
                or lower(user.displayName) like lower(concat('%', :query, '%'))
              )
            order by
              case
                when lower(user.username) = lower(:query) then 0
                when lower(user.displayName) = lower(:query) then 1
                when lower(user.username) like lower(concat(:query, '%')) then 2
                when lower(user.displayName) like lower(concat(:query, '%')) then 3
                when lower(user.username) like lower(concat('%', :query, '%')) then 4
                else 5
              end asc,
              user.displayName asc,
              user.username asc
            """)
    List<UserAccount> searchByUsernameOrDisplayName(
            @Param("excludeUserId") UUID excludeUserId,
            @Param("query") String query,
            Pageable pageable
    );
}
