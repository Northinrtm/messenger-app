package com.north.messenger.application.auth;

import java.util.List;

public class PasswordPolicyViolationException extends RuntimeException {

    private final List<String> details;

    public PasswordPolicyViolationException(List<String> details) {
        super("Password does not meet security requirements");
        this.details = List.copyOf(details);
    }

    public List<String> getDetails() {
        return details;
    }
}
