package com.north.messenger.application.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(
        boolean enabled,
        String domain,
        String stalwartUrl,
        String stalwartAdminSecret,
        String imapHost,
        int imapPort,
        String smtpHost,
        int smtpPort,
        String credentialSecret
) {
    public String imapAddress(String username) {
        return username + "@" + domain;
    }
}
