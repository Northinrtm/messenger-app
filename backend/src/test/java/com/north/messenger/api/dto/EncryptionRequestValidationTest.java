package com.north.messenger.api.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
    void shouldRejectNestedInvalidOneTimePrekey() {
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                UUID.randomUUID(),
                "jwk-identity",
                "X25519",
                "jwk-signature",
                "Ed25519",
                1,
                "jwk-signed-prekey",
                "signature",
                "X25519",
                List.of(new UserEncryptionOneTimePrekeyRequest(1, ""))
        );

        Set<ConstraintViolation<UserEncryptionDeviceRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .anyMatch(path -> path.contains("oneTimePrekeys"));
    }

    @Test
    void shouldRejectTooManyOneTimePrekeys() {
        List<UserEncryptionOneTimePrekeyRequest> prekeys = java.util.stream.IntStream.range(0, 257)
                .mapToObj(index -> new UserEncryptionOneTimePrekeyRequest(index, "jwk-" + index))
                .toList();
        UserEncryptionDeviceRequest request = new UserEncryptionDeviceRequest(
                UUID.randomUUID(),
                "jwk-identity",
                "X25519",
                "jwk-signature",
                "Ed25519",
                1,
                "jwk-signed-prekey",
                "signature",
                "X25519",
                prekeys
        );

        Set<ConstraintViolation<UserEncryptionDeviceRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains("oneTimePrekeys");
    }

    @Test
    void shouldRejectTooManyBundleTargets() {
        List<UUID> userIds = java.util.stream.Stream.generate(UUID::randomUUID)
                .limit(101)
                .toList();
        ResolveEncryptionDeviceBundlesRequest request = new ResolveEncryptionDeviceBundlesRequest(
                userIds,
                List.of(),
                Boolean.FALSE,
                null
        );

        Set<ConstraintViolation<ResolveEncryptionDeviceBundlesRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains("userIds");
    }

    @Test
    void shouldRejectTooManyEncryptedRecipientPayloads() {
        Map<String, String> encryptedKeysByRecipientId = java.util.stream.IntStream.range(0, 513)
                .boxed()
                .collect(java.util.stream.Collectors.toMap(
                        index -> UUID.randomUUID().toString(),
                        index -> "payload-" + index
                ));
        EncryptedMessagePayloadRequest request = new EncryptedMessagePayloadRequest(
                "X3DH-DEVICE-AES-GCM",
                encryptedKeysByRecipientId
        );

        Set<ConstraintViolation<EncryptedMessagePayloadRequest>> violations = validator.validate(request);

        assertThat(violations)
                .extracting(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .contains("encryptedKeysByRecipientId");
    }
}
