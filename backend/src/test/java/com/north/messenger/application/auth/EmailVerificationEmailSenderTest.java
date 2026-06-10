package com.north.messenger.application.auth;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class EmailVerificationEmailSenderTest {

    @Test
    void shouldBuildPlainTextVerificationEmail() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        EmailVerificationEmailSender sender = new EmailVerificationEmailSender(
                mailSender,
                new EmailVerificationProperties(
                        true,
                        Duration.ofHours(24),
                        "https://app.example/",
                        "no-reply@example.com"
                ),
                "smtp.example.com"
        );

        sender.sendVerificationEmail("user@example.com", "token-123");

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        SimpleMailMessage message = messageCaptor.getValue();
        assertThat(message.getTo()).containsExactly("user@example.com");
        assertThat(message.getFrom()).isEqualTo("no-reply@example.com");
        assertThat(message.getSubject()).isEqualTo("Verify your Akatosfera AI email");
        assertThat(message.getText()).contains("https://app.example/?verifyEmailToken=token-123");
        assertThat(message.getText()).contains("This link expires in 1440 minutes.");
    }
}
