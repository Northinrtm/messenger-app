package com.north.messenger.application.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClusterJobLockService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterJobLockService.class);

    private final JdbcTemplate jdbcTemplate;

    public ClusterJobLockService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean runIfLockAcquired(long lockId, Runnable task) {
        if (!tryAcquire(lockId)) {
            return false;
        }

        task.run();
        return true;
    }

    private boolean tryAcquire(long lockId) {
        try {
            Boolean acquired = jdbcTemplate.queryForObject(
                    "select pg_try_advisory_xact_lock(?)",
                    Boolean.class,
                    lockId
            );
            return Boolean.TRUE.equals(acquired);
        } catch (DataAccessException exception) {
            LOGGER.warn(
                    "Postgres advisory locks are unavailable; running scheduled job without cluster lock",
                    exception
            );
            return true;
        }
    }
}
