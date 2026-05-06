package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IdentitySignedAccountKeyServiceTest {

    private static final String ACCOUNT_KEY_SIGNATURE_CONTEXT = IdentitySignedAccountKeyService.ACCOUNT_KEY_SIGNATURE_CONTEXT;
    private static final String IDENTITY_KEY_ALGORITHM = IdentitySignedAccountKeyService.IDENTITY_KEY_ALGORITHM;
    private static final String ACCOUNT_KEY_ALGORITHM = IdentitySignedAccountKeyService.ACCOUNT_KEY_ALGORITHM;
    private static final String SIGNED_AT = "2026-04-10T10:05:00Z";
    private static final PSSParameterSpec RSA_PSS_SHA256_PARAMETERS = new PSSParameterSpec(
            "SHA-256",
            "MGF1",
            MGF1ParameterSpec.SHA256,
            32,
            1
    );

    @Test
    void verifySignedAccountKeyBundleShouldAcceptValidSignature() throws Exception {
        IdentitySignedAccountKeyService service = new IdentitySignedAccountKeyService(new ObjectMapper());
        UUID userId = UUID.randomUUID();
        String publicKey = "{\"kty\":\"RSA\",\"kid\":\"account\"}";
        long accountKeyVersion = 3L;
        long identityGeneration = 2L;
        KeyPair identityKeyPair = generateIdentitySigningKeyPair();
        String identitySigningPublicKey = toRsaJwk((RSAPublicKey) identityKeyPair.getPublic());

        String signature = signBundle(
                identityKeyPair,
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey
        );

        assertThatCode(() -> service.verifySignedAccountKeyBundle(
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey,
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                signature
        )).doesNotThrowAnyException();
    }

    @Test
    void verifySignedAccountKeyBundleShouldRejectInvalidSignature() throws Exception {
        IdentitySignedAccountKeyService service = new IdentitySignedAccountKeyService(new ObjectMapper());
        UUID userId = UUID.randomUUID();
        String publicKey = "{\"kty\":\"RSA\",\"kid\":\"account\"}";
        long accountKeyVersion = 3L;
        long identityGeneration = 2L;
        KeyPair identityKeyPair = generateIdentitySigningKeyPair();
        String identitySigningPublicKey = toRsaJwk((RSAPublicKey) identityKeyPair.getPublic());

        assertThatThrownBy(() -> service.verifySignedAccountKeyBundle(
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey,
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                Base64.getEncoder().encodeToString("bad-signature".getBytes(StandardCharsets.UTF_8))
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Account key signature is invalid");
    }

    private KeyPair generateIdentitySigningKeyPair() throws Exception {
        return generateIdentitySigningKeyPair(3072);
    }

    @Test
    void verifySignedAccountKeyBundleShouldRejectWeakIdentitySigningKey() throws Exception {
        IdentitySignedAccountKeyService service = new IdentitySignedAccountKeyService(new ObjectMapper());
        UUID userId = UUID.randomUUID();
        String publicKey = "{\"kty\":\"RSA\",\"kid\":\"account\"}";
        long accountKeyVersion = 3L;
        long identityGeneration = 2L;
        KeyPair weakIdentityKeyPair = generateIdentitySigningKeyPair(2048);
        String identitySigningPublicKey = toRsaJwk((RSAPublicKey) weakIdentityKeyPair.getPublic());

        String signature = signBundle(
                weakIdentityKeyPair,
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey
        );

        assertThatThrownBy(() -> service.verifySignedAccountKeyBundle(
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey,
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                signature
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("3072-bit RSA modulus");
    }

    private KeyPair generateIdentitySigningKeyPair(int keySize) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(keySize);
        return generator.generateKeyPair();
    }

    private String signBundle(
            KeyPair identityKeyPair,
            UUID userId,
            String publicKey,
            long accountKeyVersion,
            long identityGeneration,
            String identitySigningPublicKey
    )
            throws Exception {
        Signature signature = Signature.getInstance("RSASSA-PSS");
        signature.setParameter(RSA_PSS_SHA256_PARAMETERS);
        signature.initSign(identityKeyPair.getPrivate());
        signature.update(buildSigningPayload(
                userId,
                publicKey,
                accountKeyVersion,
                identityGeneration,
                identitySigningPublicKey
        ));
        return Base64.getEncoder().encodeToString(signature.sign());
    }

    private byte[] buildSigningPayload(
            UUID userId,
            String publicKey,
            long accountKeyVersion,
            long identityGeneration,
            String identitySigningPublicKey
    ) {
        return String.join(
                "\n",
                ACCOUNT_KEY_SIGNATURE_CONTEXT,
                userId.toString(),
                Long.toString(identityGeneration),
                Long.toString(accountKeyVersion),
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                SIGNED_AT,
                identitySigningPublicKey,
                publicKey
        ).getBytes(StandardCharsets.UTF_8);
    }

    private String toRsaJwk(RSAPublicKey publicKey) {
        return """
                {
                  "kty": "RSA",
                  "n": "%s",
                  "e": "%s"
                }
                """.formatted(
                encodeBase64Url(publicKey.getModulus()),
                encodeBase64Url(publicKey.getPublicExponent())
        );
    }

    private String encodeBase64Url(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            bytes = trimmed;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
