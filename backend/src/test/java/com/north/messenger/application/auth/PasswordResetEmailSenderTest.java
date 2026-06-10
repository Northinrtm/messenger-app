package com.north.messenger.application.auth;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PasswordResetEmailSenderTest {

    @Test
    void shouldBuildPlainTextPasswordResetEmail() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        PasswordResetEmailSender sender = new PasswordResetEmailSender(
                mailSender,
                new PasswordResetProperties(
                        true,
                        Duration.ofMinutes(30),
                        "https://app.example/reset-password",
                        "no-reply@example.com"
                ),
                "smtp.example.com"
        );

        sender.sendPasswordResetEmail("user@example.com", "token-123");

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        SimpleMailMessage message = messageCaptor.getValue();
        assertThat(message.getTo()).containsExactly("user@example.com");
        assertThat(message.getFrom()).isEqualTo("no-reply@example.com");
        assertThat(message.getSubject()).isEqualTo("Akatosfera AI password reset");
        assertThat(message.getText()).contains("https://app.example/reset-password?resetToken=token-123");
        assertThat(message.getText()).contains("This link expires in 30 minutes.");
    }

    @Test
    void shouldBuildPasswordResetEmailForRootApplicationUrl() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        PasswordResetEmailSender sender = new PasswordResetEmailSender(
                mailSender,
                new PasswordResetProperties(
                        true,
                        Duration.ofMinutes(30),
                        "http://localhost:3000/",
                        "noreply@localhost"
                ),
                "smtp.example.com"
        );

        sender.sendPasswordResetEmail("user@example.com", "token-123");

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        assertThat(messageCaptor.getValue().getText()).contains("http://localhost:3000/?resetToken=token-123");
    }
}
