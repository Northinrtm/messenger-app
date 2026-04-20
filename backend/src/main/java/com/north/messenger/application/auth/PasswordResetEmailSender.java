package com.north.messenger.application.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class PasswordResetEmailSender {

    private final JavaMailSender mailSender;
    private final PasswordResetProperties properties;

    public PasswordResetEmailSender(
            JavaMailSender mailSender,
            PasswordResetProperties properties,
            @Value("${spring.mail.host:}") String mailHost
    ) {
        if (properties.enabled() && (mailHost == null || mailHost.isBlank())) {
            throw new IllegalStateException("spring.mail.host must be configured when password reset is enabled");
        }
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public void sendPasswordResetEmail(String recipientEmail, String token) {
        if (!properties.enabled()) {
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipientEmail);
        message.setFrom(properties.fromAddress());
        message.setSubject("North Messenger password reset");
        message.setText("""
                You requested a password reset for your North Messenger account.

                Open this link to set a new password:
                %s

                If you did not request this change, you can ignore this email.
                This link expires in %d minutes.
                """.formatted(buildResetUrl(token), Math.max(properties.tokenTtl().toMinutes(), 1L)));
        mailSender.send(message);
    }

    private String buildResetUrl(String token) {
        String separator = properties.urlBase().contains("?") ? "&" : "?";
        return properties.urlBase() + separator + "resetToken=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }
}
