package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.VideoConferenceAttendance;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VideoConferenceAttendanceRepository extends JpaRepository<VideoConferenceAttendance, UUID> {

    Optional<VideoConferenceAttendance> findByConferenceIdAndSessionId(UUID conferenceId, UUID sessionId);

    @Query("""
            select count(attendance)
            from VideoConferenceAttendance attendance
            where attendance.conferenceId = :conferenceId
              and attendance.leftAt is null
              and attendance.lastSeenAt >= :activeAfter
            """)
    long countActiveSessions(UUID conferenceId, Instant activeAfter);

    @Query("""
            select max(attendance.lastSeenAt)
            from VideoConferenceAttendance attendance
            where attendance.conferenceId = :conferenceId
            """)
    Instant findLatestSeenAt(UUID conferenceId);
}
