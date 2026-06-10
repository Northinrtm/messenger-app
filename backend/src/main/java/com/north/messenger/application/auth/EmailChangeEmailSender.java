package com.north.messenger.application.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class EmailChangeEmailSender {

    private final JavaMailSender mailSender;
    private final EmailChangeProperties properties;

    public EmailChangeEmailSender(
            JavaMailSender mailSender,
            EmailChangeProperties properties,
            @Value("${spring.mail.host:}") String mailHost
    ) {
        if (properties.enabled() && (mailHost == null || mailHost.isBlank())) {
            throw new IllegalStateException("spring.mail.host must be configured when email change is enabled");
        }
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public void sendEmailChangeConfirmation(String recipientEmail, String token) {
        if (!properties.enabled()) {
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipientEmail);
        message.setFrom(properties.fromAddress());
        message.setSubject("Confirm your new Akatosfera AI email");
        message.setText("""
                You requested to change your Akatosfera AI email address to this address.

                Open this link to confirm the change:
                %s

                If you did not request this change, you can ignore this email.
                This link expires in %d minutes.
                """.formatted(buildConfirmUrl(token), Math.max(properties.tokenTtl().toMinutes(), 1L)));
        mailSender.send(message);
    }

    private String buildConfirmUrl(String token) {
        String separator = properties.urlBase().contains("?") ? "&" : "?";
        return properties.urlBase() + separator + "emailChangeToken=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }
}
