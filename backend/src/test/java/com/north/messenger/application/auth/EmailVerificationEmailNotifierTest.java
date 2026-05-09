package com.north.messenger.application.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

class EmailVerificationEmailNotifierTest {

    @Test
    void shouldForwardVerificationEventToEmailSender() {
        EmailVerificationEmailSender emailSender = mock(EmailVerificationEmailSender.class);
        EmailVerificationEmailNotifier notifier = new EmailVerificationEmailNotifier(emailSender);

        notifier.onEmailVerificationRequested(
                new EmailVerificationRequestedEvent("north@example.com", "verify-token")
        );

        verify(emailSender).sendVerificationEmail("north@example.com", "verify-token");
    }

    @Test
    void shouldPropagateDeliveryFailures() {
        EmailVerificationEmailSender emailSender = mock(EmailVerificationEmailSender.class);
        EmailVerificationEmailNotifier notifier = new EmailVerificationEmailNotifier(emailSender);
        doThrow(new IllegalStateException("smtp unavailable"))
                .when(emailSender)
                .sendVerificationEmail("north@example.com", "verify-token");

        assertThatThrownBy(() -> notifier.onEmailVerificationRequested(
                new EmailVerificationRequestedEvent("north@example.com", "verify-token")
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("smtp unavailable");
    }
}
