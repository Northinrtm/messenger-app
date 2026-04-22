package com.north.messenger.application.chat;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DirectChatCreationLockService {

    private static final Logger log = LoggerFactory.getLogger(DirectChatCreationLockService.class);
    private static final long DIRECT_CHAT_LOCK_NAMESPACE = 0x4d53474449524543L;

    private final JdbcTemplate jdbcTemplate;

    public DirectChatCreationLockService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForPair(UUID firstUserId, UUID secondUserId) {
        long lockId = lockId(firstUserId, secondUserId);
        try {
            jdbcTemplate.queryForList("select pg_advisory_xact_lock(?)", lockId);
        } catch (DataAccessException exception) {
            log.warn(
                    "Postgres advisory lock is unavailable for direct chat creation; relying on unique direct pair constraint",
                    exception
            );
        }
    }

    private long lockId(UUID firstUserId, UUID secondUserId) {
        int comparison = firstUserId.toString().compareTo(secondUserId.toString());
        UUID lowUserId = comparison < 0 ? firstUserId : secondUserId;
        UUID highUserId = comparison < 0 ? secondUserId : firstUserId;
        long value = DIRECT_CHAT_LOCK_NAMESPACE;
        value = 31L * value + lowUserId.getMostSignificantBits();
        value = 31L * value + lowUserId.getLeastSignificantBits();
        value = 31L * value + highUserId.getMostSignificantBits();
        value = 31L * value + highUserId.getLeastSignificantBits();
        return value;
    }
}
