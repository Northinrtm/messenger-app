package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
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
        List<ParticipantResponse> participants,
        @Schema(description = "Group chat that owns this conference when the call is chat-bound")
        UUID chatId,
        @Schema(description = "Current number of participants with fresh live presence")
        int activeParticipantCount,
        @Schema(description = "User ids that currently have fresh live presence in the conference")
        List<UUID> activeParticipantUserIds
) {
    public VideoConferenceResponse(
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
        this(
                id,
                title,
                roomName,
                roomAccessCode,
                scheduledAt,
                createdAt,
                activatedAt,
                startedAt,
                endedAt,
                recordingCreatedAt,
                recordingSizeBytes,
                recordingMimeType,
                createdBy,
                participants,
                null,
                0,
                List.of()
        );
    }
}
