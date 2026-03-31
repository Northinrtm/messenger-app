package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ConferenceRecording;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConferenceRecordingRepository extends JpaRepository<ConferenceRecording, UUID> {

    Optional<ConferenceRecording> findByConferenceId(UUID conferenceId);

    List<ConferenceRecording> findAllByConferenceIdIn(Collection<UUID> conferenceIds);
}
