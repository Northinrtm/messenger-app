package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class IdentitySignedAccountKeyService {

    public static final String ACCOUNT_KEY_SIGNATURE_CONTEXT = "north.account-key-bundle.v2";
    public static final String IDENTITY_KEY_ALGORITHM = "RSA-PSS-SHA256";
    public static final String ACCOUNT_KEY_ALGORITHM = "RSA-OAEP-3072-SHA256";
    private static final int MIN_RSA_MODULUS_BITS = 3072;
    private static final BigInteger REQUIRED_RSA_PUBLIC_EXPONENT = BigInteger.valueOf(65537L);
    private static final PSSParameterSpec RSA_PSS_SHA256_PARAMETERS = new PSSParameterSpec(
            "SHA-256",
            "MGF1",
            MGF1ParameterSpec.SHA256,
            32,
            1
    );

    private final ObjectMapper objectMapper;

    public IdentitySignedAccountKeyService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void verifySignedAccountKeyBundle(
            UUID userId,
            String publicKey,
            long accountKeyVersion,
            long identityGeneration,
            String identitySigningPublicKey,
            String identityKeyAlgorithm,
            String accountKeyAlgorithm,
            String signedAt,
            String signature
    ) {
        try {
            if (!IDENTITY_KEY_ALGORITHM.equals(identityKeyAlgorithm)) {
                throw new IllegalArgumentException("Unsupported identity key algorithm");
            }
            if (!ACCOUNT_KEY_ALGORITHM.equals(accountKeyAlgorithm)) {
                throw new IllegalArgumentException("Unsupported account key algorithm");
            }
            parseSignedAt(signedAt);
            byte[] signatureBytes;
            try {
                signatureBytes = Base64.getDecoder().decode(signature);
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException("Account key signature is invalid", exception);
            }
            PublicKey signingPublicKey = parseRsaPublicKey(identitySigningPublicKey);
            Signature verifier = Signature.getInstance("RSASSA-PSS");
            verifier.setParameter(RSA_PSS_SHA256_PARAMETERS);
            verifier.initVerify(signingPublicKey);
            verifier.update(buildSigningPayload(
                    userId,
                    publicKey,
                    accountKeyVersion,
                    identityGeneration,
                    identitySigningPublicKey,
                    identityKeyAlgorithm,
                    accountKeyAlgorithm,
                    signedAt
            ));
            boolean valid;
            try {
                valid = verifier.verify(signatureBytes);
            } catch (SignatureException exception) {
                throw new IllegalArgumentException("Account key signature is invalid", exception);
            }
            if (!valid) {
                throw new IllegalArgumentException("Account key signature is invalid");
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("Failed to verify account key signature", exception);
        }
    }

    public Instant parseSignedAt(String signedAt) {
        if (signedAt == null || signedAt.isBlank()) {
            throw new IllegalArgumentException("Account key signedAt is required");
        }
        try {
            return Instant.parse(signedAt);
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException("Account key signedAt is invalid", exception);
        }
    }

    private byte[] buildSigningPayload(
            UUID userId,
            String publicKey,
            long accountKeyVersion,
            long identityGeneration,
            String identitySigningPublicKey,
            String identityKeyAlgorithm,
            String accountKeyAlgorithm,
            String signedAt
    ) {
        return String.join(
                "\n",
                ACCOUNT_KEY_SIGNATURE_CONTEXT,
                userId.toString(),
                Long.toString(identityGeneration),
                Long.toString(accountKeyVersion),
                identityKeyAlgorithm,
                accountKeyAlgorithm,
                signedAt,
                identitySigningPublicKey,
                publicKey
        ).getBytes(StandardCharsets.UTF_8);
    }

    private PublicKey parseRsaPublicKey(String serializedPublicKey) throws Exception {
        JsonNode jwk = objectMapper.readTree(serializedPublicKey);
        if (!"RSA".equals(jwk.path("kty").asText())) {
            throw new IllegalArgumentException("Unsupported identity signing public key type");
        }

        String modulus = jwk.path("n").asText();
        String exponent = jwk.path("e").asText();
        if (modulus == null || modulus.isBlank() || exponent == null || exponent.isBlank()) {
            throw new IllegalArgumentException("Identity signing public key is malformed");
        }

        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        BigInteger parsedModulus = new BigInteger(1, decodeBase64Url(modulus));
        BigInteger parsedExponent = new BigInteger(1, decodeBase64Url(exponent));
        if (parsedModulus.bitLength() < MIN_RSA_MODULUS_BITS) {
            throw new IllegalArgumentException("Identity signing public key must use at least 3072-bit RSA modulus");
        }
        if (!REQUIRED_RSA_PUBLIC_EXPONENT.equals(parsedExponent)) {
            throw new IllegalArgumentException("Identity signing public key must use RSA public exponent 65537");
        }
        return keyFactory.generatePublic(new RSAPublicKeySpec(
                parsedModulus,
                parsedExponent
        ));
    }

    private byte[] decodeBase64Url(String value) {
        int requiredPadding = (4 - (value.length() % 4)) % 4;
        String paddedValue = value + "=".repeat(requiredPadding);
        return Base64.getUrlDecoder().decode(paddedValue);
    }
}
