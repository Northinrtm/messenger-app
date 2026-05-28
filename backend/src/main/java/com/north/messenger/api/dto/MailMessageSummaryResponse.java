package com.north.messenger.api.dto;

import java.time.Instant;

public record MailMessageSummaryResponse(
        String id,
        String from,
        String subject,
        Instant sentAt,
        boolean read
) {
}
