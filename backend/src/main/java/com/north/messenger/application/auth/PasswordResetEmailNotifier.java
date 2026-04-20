package com.north.messenger.application.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PasswordResetEmailNotifier {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetEmailNotifier.class);

    private final PasswordResetEmailSender passwordResetEmailSender;

    public PasswordResetEmailNotifier(PasswordResetEmailSender passwordResetEmailSender) {
        this.passwordResetEmailSender = passwordResetEmailSender;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPasswordResetRequested(PasswordResetRequestedEvent event) {
        try {
            passwordResetEmailSender.sendPasswordResetEmail(event.email(), event.token());
        } catch (RuntimeException exception) {
            log.error("Failed to send password reset email to {}", event.email(), exception);
        }
    }
}
