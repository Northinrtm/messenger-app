package com.north.messenger.application.auth;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class PasswordPolicyService {

    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "00000000",
            "11111111",
            "1111111111",
            "11223344",
            "12121212",
            "123123123",
            "123321123",
            "12345678",
            "123456789",
            "1234567890",
            "12345678910",
            "654321",
            "65432100",
            "66666666",
            "77777777",
            "87654321",
            "987654321",
            "abc123456",
            "admin",
            "administrator",
            "admin123",
            "dragon",
            "football",
            "freedom",
            "iloveyou",
            "letmein",
            "login",
            "monkey",
            "passw0rd",
            "password",
            "password1",
            "password123",
            "password123!",
            "princess",
            "qazwsx",
            "qwerty",
            "qwerty123",
            "qwerty123!",
            "qwertyuiop",
            "sunshine",
            "welcome",
            "welcome123"
    );

    public void validatePassword(String username, String displayName, String password) {
        List<String> violations = new ArrayList<>();
        if (password.length() < MIN_PASSWORD_LENGTH) {
            violations.add("password: Password must be at least 8 characters long");
        }
        if (password.chars().noneMatch(Character::isLetter)) {
            violations.add("password: Password must contain at least one letter");
        }
        if (COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))) {
            violations.add("password: Password is too common or previously compromised");
        }
        if (containsPersonalInfo(password, username, displayName)) {
            violations.add("password: Password must not contain your username or display name");
        }
        if (isRepeatedCharacterPassword(password)) {
            violations.add("password: Password must not repeat the same character");
        }
        if (hasSequentialPattern(password)) {
            violations.add("password: Password must not contain simple sequential patterns");
        }

        if (!violations.isEmpty()) {
            throw new PasswordPolicyViolationException(violations);
        }
    }

    private boolean containsPersonalInfo(String password, String username, String displayName) {
        String normalizedPassword = password.toLowerCase(Locale.ROOT);
        return candidateTokens(username, displayName).stream()
                .anyMatch(normalizedPassword::contains);
    }

    private Set<String> candidateTokens(String username, String displayName) {
        Set<String> tokens = new LinkedHashSet<>();
        collectToken(tokens, username);
        if (displayName != null) {
            for (String token : displayName.split("[^\\p{IsAlphabetic}\\p{IsDigit}]+")) {
                collectToken(tokens, token);
            }
        }
        return tokens;
    }

    private void collectToken(Set<String> tokens, String rawValue) {
        if (rawValue == null) {
            return;
        }

        String normalized = rawValue.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() >= 3) {
            tokens.add(normalized);
        }
    }

    private boolean isRepeatedCharacterPassword(String password) {
        return password.chars().distinct().count() <= 1;
    }

    private boolean hasSequentialPattern(String password) {
        String normalized = password.toLowerCase(Locale.ROOT);
        for (int index = 0; index <= normalized.length() - 4; index++) {
            if (isSequentialChunk(normalized.substring(index, index + 4))) {
                return true;
            }
        }

        return false;
    }

    private boolean isSequentialChunk(String chunk) {
        boolean ascending = true;
        boolean descending = true;
        for (int index = 1; index < chunk.length(); index++) {
            int difference = chunk.charAt(index) - chunk.charAt(index - 1);
            ascending &= difference == 1;
            descending &= difference == -1;
        }

        return ascending || descending;
    }
}
