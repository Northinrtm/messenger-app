package com.north.messenger.application.auth;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class EmailChangeEmailNotifier {

    private final EmailChangeEmailSender emailChangeEmailSender;

    public EmailChangeEmailNotifier(EmailChangeEmailSender emailChangeEmailSender) {
        this.emailChangeEmailSender = emailChangeEmailSender;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onEmailChangeRequested(EmailChangeRequestedEvent event) {
        emailChangeEmailSender.sendEmailChangeConfirmation(event.pendingEmail(), event.token());
    }
}
