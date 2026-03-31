package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record VideoConferenceResponse(
        UUID id,
        String title,
        String roomName,
        String roomAccessCode,
        Instant scheduledAt,
        Instant createdAt,
        Instant activatedAt,
        Instant startedAt,
        Instant endedAt,
        Instant recordingCreatedAt,
        Long recordingSizeBytes,
        String recordingMimeType,
        ParticipantResponse createdBy,
        List<ParticipantResponse> participants
) {
}
