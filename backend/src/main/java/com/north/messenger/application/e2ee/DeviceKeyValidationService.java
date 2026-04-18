package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.UserEncryptionDeviceRequest;
import com.north.messenger.api.dto.UserEncryptionOneTimePrekeyRequest;
import com.north.messenger.domain.model.UserEncryptionDevice;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class DeviceKeyValidationService {

    private static final String AGREEMENT_ALGORITHM = "X25519";
    private static final String SIGNATURE_ALGORITHM = "Ed25519";
    private static final byte[] X25519_SPKI_PREFIX = hex("302a300506032b656e032100");
    private static final byte[] ED25519_SPKI_PREFIX = hex("302a300506032b6570032100");
    private static final byte[] SIGNED_PREKEY_SIGNATURE_CONTEXT =
            "north-signed-prekey-v1".getBytes(StandardCharsets.UTF_8);

    private final ObjectMapper objectMapper;

    public DeviceKeyValidationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void validateDeviceRegistrationRequest(UserEncryptionDeviceRequest request) {
        if (!AGREEMENT_ALGORITHM.equals(request.identityKeyAlgorithm())
                || !SIGNATURE_ALGORITHM.equals(request.identitySignatureKeyAlgorithm())
                || !AGREEMENT_ALGORITHM.equals(request.signedPrekeyAlgorithm())) {
            throw badRequest("Encryption device algorithms are invalid");
        }

        ValidatedOkpPublicKey signatureIdentityKey = validatePublicOkpJwk(
                request.identitySignatureKey(),
                SIGNATURE_ALGORITHM,
                "Encryption device identity signature key is malformed"
        );
        validatePublicOkpJwk(
                request.identityKey(),
                AGREEMENT_ALGORITHM,
                "Encryption device identity key is malformed"
        );
        validatePublicOkpJwk(
                request.signedPrekeyPublicKey(),
                AGREEMENT_ALGORITHM,
                "Encryption device signed prekey is malformed"
        );
        for (UserEncryptionOneTimePrekeyRequest prekey : request.oneTimePrekeys()) {
            validatePublicOkpJwk(
                    prekey.publicKey(),
                    AGREEMENT_ALGORITHM,
                    "Encryption device one-time prekey is malformed"
            );
        }

        verifySignedPrekeySignature(
                signatureIdentityKey.publicKey(),
                request.signedPrekeyPublicKey(),
                request.signedPrekeySignature()
        );
    }

    public boolean hasValidCurrentSignedPrekey(UserEncryptionDevice device) {
        try {
            if (!AGREEMENT_ALGORITHM.equals(device.getIdentityKeyAlgorithm())
                    || !SIGNATURE_ALGORITHM.equals(device.getIdentitySignatureKeyAlgorithm())
                    || !AGREEMENT_ALGORITHM.equals(device.getSignedPrekeyAlgorithm())) {
                return false;
            }

            ValidatedOkpPublicKey signatureIdentityKey = validatePublicOkpJwk(
                    device.getIdentitySignatureKey(),
                    SIGNATURE_ALGORITHM,
                    "Encryption device identity signature key is malformed"
            );
            validatePublicOkpJwk(
                    device.getIdentityKey(),
                    AGREEMENT_ALGORITHM,
                    "Encryption device identity key is malformed"
            );
            validatePublicOkpJwk(
                    device.getSignedPrekeyPublicKey(),
                    AGREEMENT_ALGORITHM,
                    "Encryption device signed prekey is malformed"
            );
            verifySignedPrekeySignature(
                    signatureIdentityKey.publicKey(),
                    device.getSignedPrekeyPublicKey(),
                    device.getSignedPrekeySignature()
            );
            return true;
        } catch (ResponseStatusException exception) {
            return false;
        }
    }

    public void validateDirectEnvelopeTransportKeys(String initiatorEphemeralPublicKey, String ratchetPublicKey) {
        validatePublicOkpJwk(
                initiatorEphemeralPublicKey,
                AGREEMENT_ALGORITHM,
                "Encrypted device envelope initiator ephemeral key is malformed"
        );
        validatePublicOkpJwk(
                ratchetPublicKey,
                AGREEMENT_ALGORITHM,
                "Encrypted device envelope ratchet key is malformed"
        );
    }

    public void verifyEd25519Signature(
            String signaturePublicKey,
            String signature,
            byte[] payload,
            String errorMessage
    ) {
        PublicKey publicKey = validatePublicOkpJwk(signaturePublicKey, SIGNATURE_ALGORITHM, errorMessage).publicKey();
        verifySignature(publicKey, signature, payload, errorMessage);
    }

    private void verifySignedPrekeySignature(PublicKey signatureIdentityKey, String signedPrekeyPublicKey, String signature) {
        byte[] rawSignedPrekey = validatePublicOkpJwk(
                signedPrekeyPublicKey,
                AGREEMENT_ALGORITHM,
                "Encryption device signed prekey is malformed"
        ).rawKey();
        verifySignature(
                signatureIdentityKey,
                signature,
                buildSignedPrekeySignaturePayload(rawSignedPrekey),
                "Encryption device signed prekey signature is invalid"
        );
    }

    private void verifySignature(PublicKey publicKey, String signature, byte[] payload, String errorMessage) {
        try {
            Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
            verifier.initVerify(publicKey);
            verifier.update(payload);
            if (!verifier.verify(decodeStandardBase64(signature, errorMessage))) {
                throw badRequest(errorMessage);
            }
        } catch (GeneralSecurityException exception) {
            throw badRequest(errorMessage);
        }
    }

    private ValidatedOkpPublicKey validatePublicOkpJwk(String serializedJwk, String expectedCurve, String errorMessage) {
        JsonNode jwk = parseJwk(serializedJwk, errorMessage);
        if (!jwk.isObject()
                || !"OKP".equals(jwk.path("kty").asText(null))
                || !expectedCurve.equals(jwk.path("crv").asText(null))
                || !jwk.path("x").isTextual()
                || jwk.path("x").asText().isBlank()
                || !jwk.path("d").isMissingNode()) {
            throw badRequest(errorMessage);
        }

        byte[] rawKey = decodeUrlSafeBase64(jwk.path("x").asText(), errorMessage);
        if (rawKey.length != 32) {
            throw badRequest(errorMessage);
        }

        try {
            PublicKey publicKey = KeyFactory.getInstance(expectedCurve).generatePublic(
                    new X509EncodedKeySpec(buildSpki(rawKey, expectedCurve))
            );
            return new ValidatedOkpPublicKey(publicKey, rawKey);
        } catch (GeneralSecurityException exception) {
            throw badRequest(errorMessage);
        }
    }

    private byte[] buildSignedPrekeySignaturePayload(byte[] rawPublicKey) {
        byte[] payload = new byte[SIGNED_PREKEY_SIGNATURE_CONTEXT.length + 1 + rawPublicKey.length];
        System.arraycopy(SIGNED_PREKEY_SIGNATURE_CONTEXT, 0, payload, 0, SIGNED_PREKEY_SIGNATURE_CONTEXT.length);
        payload[SIGNED_PREKEY_SIGNATURE_CONTEXT.length] = 0;
        System.arraycopy(
                rawPublicKey,
                0,
                payload,
                SIGNED_PREKEY_SIGNATURE_CONTEXT.length + 1,
                rawPublicKey.length
        );
        return payload;
    }

    private JsonNode parseJwk(String serializedJwk, String errorMessage) {
        try {
            return objectMapper.readTree(serializedJwk);
        } catch (JsonProcessingException exception) {
            throw badRequest(errorMessage);
        }
    }

    private byte[] buildSpki(byte[] rawKey, String algorithm) {
        byte[] prefix = SIGNATURE_ALGORITHM.equals(algorithm) ? ED25519_SPKI_PREFIX : X25519_SPKI_PREFIX;
        byte[] encoded = new byte[prefix.length + rawKey.length];
        System.arraycopy(prefix, 0, encoded, 0, prefix.length);
        System.arraycopy(rawKey, 0, encoded, prefix.length, rawKey.length);
        return encoded;
    }

    private byte[] decodeUrlSafeBase64(String value, String errorMessage) {
        try {
            return Base64.getUrlDecoder().decode(padBase64(value));
        } catch (IllegalArgumentException exception) {
            throw badRequest(errorMessage);
        }
    }

    private byte[] decodeStandardBase64(String value, String errorMessage) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException exception) {
            throw badRequest(errorMessage);
        }
    }

    private static String padBase64(String value) {
        int remainder = value.length() % 4;
        if (remainder == 0) {
            return value;
        }
        return value + "=".repeat(4 - remainder);
    }

    private static byte[] hex(String value) {
        byte[] bytes = new byte[value.length() / 2];
        for (int index = 0; index < bytes.length; index += 1) {
            int offset = index * 2;
            bytes[index] = (byte) Integer.parseInt(value.substring(offset, offset + 2), 16);
        }
        return bytes;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record ValidatedOkpPublicKey(PublicKey publicKey, byte[] rawKey) {
    }
}
