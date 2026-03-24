package com.north.messenger.application.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;

class PasswordPolicyServiceTest {

    private final PasswordPolicyService passwordPolicyService = new PasswordPolicyService();

    @Test
    void shouldRejectCommonPassword() {
        assertThatThrownBy(() ->
                passwordPolicyService.validateRegistrationPassword("north", "North", "Password123!")
        )
                .isInstanceOf(PasswordPolicyViolationException.class)
                .hasMessage("Password does not meet security requirements");
    }

    @Test
    void shouldRejectPasswordContainingUsername() {
        assertThatThrownBy(() ->
                passwordPolicyService.validateRegistrationPassword("north", "North User", "NorthUser123!")
        )
                .isInstanceOf(PasswordPolicyViolationException.class);
    }

    @Test
    void shouldAcceptStrongPassword() {
        assertThatNoException().isThrownBy(() ->
                passwordPolicyService.validateRegistrationPassword("north", "North User", "S3cure!River")
        );
    }
}
