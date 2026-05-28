package com.north.messenger.application.mail;

import java.time.Instant;

public record MailMessageSummary(
        String id,
        String from,
        String subject,
        Instant sentAt,
        boolean read
) {
}
