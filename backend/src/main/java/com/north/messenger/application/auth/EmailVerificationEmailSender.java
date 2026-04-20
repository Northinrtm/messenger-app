package com.north.messenger.application.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class EmailVerificationEmailSender {

    private final JavaMailSender mailSender;
    private final EmailVerificationProperties properties;

    public EmailVerificationEmailSender(
            JavaMailSender mailSender,
            EmailVerificationProperties properties,
            @Value("${spring.mail.host:}") String mailHost
    ) {
        if (properties.enabled() && (mailHost == null || mailHost.isBlank())) {
            throw new IllegalStateException("spring.mail.host must be configured when email verification is enabled");
        }
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public void sendVerificationEmail(String recipientEmail, String token) {
        if (!properties.enabled()) {
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipientEmail);
        message.setFrom(properties.fromAddress());
        message.setSubject("Verify your North Messenger email");
        message.setText("""
                Welcome to North Messenger.

                Open this link to verify your email address:
                %s

                If you did not create this account, you can ignore this email.
                This link expires in %d minutes.
                """.formatted(buildVerificationUrl(token), Math.max(properties.tokenTtl().toMinutes(), 1L)));
        mailSender.send(message);
    }

    private String buildVerificationUrl(String token) {
        String separator = properties.urlBase().contains("?") ? "&" : "?";
        return properties.urlBase() + separator + "verifyEmailToken=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }
}
