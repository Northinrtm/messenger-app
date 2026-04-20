package com.north.messenger.application.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class EmailVerificationEmailNotifier {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationEmailNotifier.class);

    private final EmailVerificationEmailSender emailVerificationEmailSender;

    public EmailVerificationEmailNotifier(EmailVerificationEmailSender emailVerificationEmailSender) {
        this.emailVerificationEmailSender = emailVerificationEmailSender;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onEmailVerificationRequested(EmailVerificationRequestedEvent event) {
        try {
            emailVerificationEmailSender.sendVerificationEmail(event.email(), event.token());
        } catch (RuntimeException exception) {
            log.error("Failed to send email verification to {}", event.email(), exception);
        }
    }
}
