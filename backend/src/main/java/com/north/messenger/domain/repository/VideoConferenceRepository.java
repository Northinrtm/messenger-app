package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.VideoConference;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoConferenceRepository extends JpaRepository<VideoConference, UUID> {

    List<VideoConference> findAllByIdIn(Collection<UUID> ids);

    List<VideoConference> findAllByEndedAtIsNotNullAndRoomNameIn(Collection<String> roomNames);

    List<VideoConference> findAllByEndedAtIsNullAndRoomNameIsNullAndScheduledAtLessThanEqual(Instant scheduledAt);

    List<VideoConference> findAllByEndedAtIsNullAndStartedAtIsNullAndScheduledAtLessThanEqual(Instant scheduledAt);
}
