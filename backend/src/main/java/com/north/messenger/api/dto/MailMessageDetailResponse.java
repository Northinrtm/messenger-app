package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;

public record MailMessageDetailResponse(
        String id,
        String from,
        List<String> to,
        String subject,
        String body,
        Instant sentAt,
        boolean read
) {
}
