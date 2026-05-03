package com.north.messenger.api.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EncryptionRequestValidationTest {

    private Validator validator;

    @BeforeEach
    void setUp() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void shouldRejectEmptyAccountKeyResolveTargets() {
        ResolveEncryptionAccountKeysRequest request = new ResolveEncryptionAccountKeysRequest(List.of());
        Set<ConstraintViolation<ResolveEncryptionAccountKeysRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains("userIds");
    }

    @Test
    void shouldRejectBlankAccountKeyPayload() {
        UserEncryptionAccountKeyRequest request = new UserEncryptionAccountKeyRequest(
                " ",
                0,
                0,
                " ",
                " ",
                " ",
                " ",
                " "
        );
        Set<ConstraintViolation<UserEncryptionAccountKeyRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains(
                        "publicKey",
                        "accountKeyVersion",
                        "identityGeneration",
                        "identitySigningPublicKey",
                        "identityKeyAlgorithm",
                        "accountKeyAlgorithm",
                        "signedAt",
                        "signature"
                );
    }

    @Test
    void shouldRejectOversizedSharedEnvelope() {
        EncryptedMessagePayloadRequest request = new EncryptedMessagePayloadRequest(
                "CHAT-EPOCH-KEY-AES-GCM",
                "x".repeat(20_001)
        );

        Set<ConstraintViolation<EncryptedMessagePayloadRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains("sharedEnvelope");
    }
}
