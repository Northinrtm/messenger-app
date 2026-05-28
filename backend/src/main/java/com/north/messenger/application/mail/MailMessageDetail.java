package com.north.messenger.application.mail;

import java.time.Instant;
import java.util.List;

public record MailMessageDetail(
        String id,
        String from,
        List<String> to,
        String subject,
        String body,
        Instant sentAt,
        boolean read
) {
}
