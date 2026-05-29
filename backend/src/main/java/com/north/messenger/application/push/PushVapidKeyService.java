package com.north.messenger.application.push;

import io.jsonwebtoken.Jwts;
import java.math.BigInteger;
import java.net.URI;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Date;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class PushVapidKeyService {

    private static final Logger log = LoggerFactory.getLogger(PushVapidKeyService.class);
    private static final String EC_CURVE = "secp256r1";
    private static final int VAPID_PUBLIC_KEY_LENGTH = 65;
    private static final int VAPID_COORDINATE_LENGTH = 32;
    private static final Duration VAPID_JWT_TTL = Duration.ofHours(12);

    private final PushNotificationProperties properties;
    private final KeyPair keyPair;
    private final String publicKey;

    public PushVapidKeyService(PushNotificationProperties properties) {
        this.properties = properties;
        this.keyPair = resolveKeyPair(properties);
        this.publicKey = encodePublicKey((ECPublicKey) keyPair.getPublic());
    }

    public String publicKey() {
        return publicKey;
    }

    public String authorizationHeader(String endpoint) {
        String token = Jwts.builder()
                .subject(properties.subject())
                .audience().add(resolveAudience(endpoint)).and()
                .expiration(Date.from(Instant.now().plus(VAPID_JWT_TTL)))
                .signWith((PrivateKey) keyPair.getPrivate(), Jwts.SIG.ES256)
                .compact();
        return "vapid t=" + token + ", k=" + publicKey;
    }

    private static KeyPair resolveKeyPair(PushNotificationProperties properties) {
        if (hasText(properties.vapidPublicKey()) && hasText(properties.vapidPrivateKey())) {
            try {
                return configuredKeyPair(properties.vapidPublicKey(), properties.vapidPrivateKey());
            } catch (RuntimeException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalStateException("Invalid VAPID key pair", exception);
            }
        }

        log.warn("APP_PUSH_VAPID_PUBLIC_KEY/APP_PUSH_VAPID_PRIVATE_KEY are not fully set. Generated ephemeral VAPID keys; existing push subscriptions will need to be refreshed after restart.");
        return generateKeyPair();
    }

    private static KeyPair configuredKeyPair(String publicKey, String privateKey) throws Exception {
        KeyFactory keyFactory = KeyFactory.getInstance("EC");
        ECParameterSpec parameterSpec = ecParameterSpec();
        byte[] publicBytes = decodeBase64Url(publicKey);
        if (publicBytes.length != VAPID_PUBLIC_KEY_LENGTH || publicBytes[0] != 0x04) {
            throw new IllegalArgumentException("VAPID public key must be an uncompressed P-256 point");
        }

        ECPoint publicPoint = new ECPoint(
                new BigInteger(1, Arrays.copyOfRange(publicBytes, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(publicBytes, 33, 65))
        );
        ECPublicKeySpec publicKeySpec = new ECPublicKeySpec(publicPoint, parameterSpec);
        ECPrivateKeySpec privateKeySpec = new ECPrivateKeySpec(
                new BigInteger(1, decodeBase64Url(privateKey)),
                parameterSpec
        );
        return new KeyPair(
                keyFactory.generatePublic(publicKeySpec),
                keyFactory.generatePrivate(privateKeySpec)
        );
    }

    private static ECParameterSpec ecParameterSpec() throws Exception {
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec(EC_CURVE));
        return parameters.getParameterSpec(ECParameterSpec.class);
    }

    private static KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec(EC_CURVE));
            return generator.generateKeyPair();
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to generate VAPID keys", exception);
        }
    }

    private static String encodePublicKey(ECPublicKey publicKey) {
        byte[] encoded = new byte[VAPID_PUBLIC_KEY_LENGTH];
        encoded[0] = 0x04;
        byte[] x = toFixedLength(publicKey.getW().getAffineX());
        byte[] y = toFixedLength(publicKey.getW().getAffineY());
        System.arraycopy(x, 0, encoded, 1, VAPID_COORDINATE_LENGTH);
        System.arraycopy(y, 0, encoded, 33, VAPID_COORDINATE_LENGTH);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(encoded);
    }

    private static byte[] toFixedLength(BigInteger value) {
        byte[] source = value.toByteArray();
        byte[] target = new byte[VAPID_COORDINATE_LENGTH];
        int copyLength = Math.min(source.length, target.length);
        System.arraycopy(source, source.length - copyLength, target, target.length - copyLength, copyLength);
        return target;
    }

    private static byte[] decodeBase64Url(String value) {
        return Base64.getUrlDecoder().decode(value.trim());
    }

    private static String resolveAudience(String endpoint) {
        URI uri = URI.create(endpoint);
        int port = uri.getPort();
        String authority = uri.getHost() + (port >= 0 ? ":" + port : "");
        return uri.getScheme() + "://" + authority;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
