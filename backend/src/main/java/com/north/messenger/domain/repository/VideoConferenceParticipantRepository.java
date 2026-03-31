package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.VideoConferenceParticipant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoConferenceParticipantRepository extends JpaRepository<VideoConferenceParticipant, UUID> {

    List<VideoConferenceParticipant> findAllByUserIdOrderByInvitedAtDesc(UUID userId);

    List<VideoConferenceParticipant> findAllByConferenceIdOrderByInvitedAtAsc(UUID conferenceId);

    List<VideoConferenceParticipant> findAllByConferenceIdInOrderByInvitedAtAsc(Collection<UUID> conferenceIds);

    boolean existsByConferenceIdAndUserId(UUID conferenceId, UUID userId);
}
