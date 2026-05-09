package com.north.messenger.application.auth;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class EmailVerificationEmailNotifier {

    private final EmailVerificationEmailSender emailVerificationEmailSender;

    public EmailVerificationEmailNotifier(EmailVerificationEmailSender emailVerificationEmailSender) {
        this.emailVerificationEmailSender = emailVerificationEmailSender;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onEmailVerificationRequested(EmailVerificationRequestedEvent event) {
        emailVerificationEmailSender.sendVerificationEmail(event.email(), event.token());
    }
}
