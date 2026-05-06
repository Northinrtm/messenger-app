package com.north.messenger.application.e2ee;

import io.jsonwebtoken.io.Decoders;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.e2ee.escrow")
public record E2eeEscrowProperties(
        String provider,
        String secret,
        String vaultAddress,
        String vaultToken,
        String vaultNamespace,
        String vaultMountPath,
        String vaultKeyName,
        Duration vaultConnectTimeout,
        Duration vaultRequestTimeout
) {
    public static final String PROVIDER_LOCAL = "local";
    public static final String PROVIDER_VAULT_TRANSIT = "vault-transit";
    private static final int MIN_SECRET_BYTES = 32;
    private static final Duration DEFAULT_VAULT_CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration DEFAULT_VAULT_REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final String DEFAULT_VAULT_MOUNT_PATH = "transit";
    private static final String DEFAULT_VAULT_KEY_NAME = "messenger-history-escrow";

    public E2eeEscrowProperties {
        provider = normalizeProvider(provider);
        vaultMountPath = normalizeValueOrDefault(vaultMountPath, DEFAULT_VAULT_MOUNT_PATH);
        vaultKeyName = normalizeValueOrDefault(vaultKeyName, DEFAULT_VAULT_KEY_NAME);
        vaultConnectTimeout = vaultConnectTimeout == null ? DEFAULT_VAULT_CONNECT_TIMEOUT : vaultConnectTimeout;
        vaultRequestTimeout = vaultRequestTimeout == null ? DEFAULT_VAULT_REQUEST_TIMEOUT : vaultRequestTimeout;

        if (!PROVIDER_LOCAL.equals(provider) && !PROVIDER_VAULT_TRANSIT.equals(provider)) {
            throw new IllegalStateException("app.e2ee.escrow.provider must be 'local' or 'vault-transit'");
        }
        if (secret != null && !secret.isBlank()) {
            validateLocalSecret(secret);
        }

        if (PROVIDER_LOCAL.equals(provider)) {
            if (secret == null || secret.isBlank()) {
                throw new IllegalStateException(
                        "app.e2ee.escrow.secret must be configured via APP_E2EE_ESCROW_SECRET"
                );
            }
        } else {
            if (vaultAddress == null || vaultAddress.isBlank()) {
                throw new IllegalStateException(
                        "app.e2ee.escrow.vault-address must be configured via APP_E2EE_ESCROW_VAULT_ADDRESS"
                );
            }
            if (vaultToken == null || vaultToken.isBlank()) {
                throw new IllegalStateException(
                        "app.e2ee.escrow.vault-token must be configured via APP_E2EE_ESCROW_VAULT_TOKEN"
                );
            }
            if (vaultMountPath == null || vaultMountPath.isBlank()) {
                throw new IllegalStateException("app.e2ee.escrow.vault-mount-path must not be blank");
            }
            if (vaultKeyName == null || vaultKeyName.isBlank()) {
                throw new IllegalStateException("app.e2ee.escrow.vault-key-name must not be blank");
            }
        }
    }

    public boolean useVaultTransit() {
        return PROVIDER_VAULT_TRANSIT.equals(provider);
    }

    public boolean hasLocalEscrowSecret() {
        return secret != null && !secret.isBlank();
    }

    private static String normalizeProvider(String value) {
        return normalizeValueOrDefault(value, PROVIDER_LOCAL);
    }

    private static String normalizeValueOrDefault(String value, String defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return value.trim();
    }

    private static void validateLocalSecret(String secret) {
        byte[] decodedSecret;
        try {
            decodedSecret = Decoders.BASE64.decode(secret);
        } catch (RuntimeException exception) {
            throw new IllegalStateException(
                    "app.e2ee.escrow.secret must be a valid Base64-encoded key",
                    exception
            );
        }
        if (decodedSecret.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("app.e2ee.escrow.secret must decode to at least 32 bytes");
        }
    }

    public String normalizedVaultAddress() {
        if (vaultAddress == null) {
            return "";
        }
        String trimmed = vaultAddress.trim();
        if (trimmed.endsWith("/")) {
            return trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    public String normalizedVaultMountPath() {
        if (vaultMountPath == null) {
            return DEFAULT_VAULT_MOUNT_PATH;
        }
        String trimmed = vaultMountPath.trim();
        while (trimmed.startsWith("/")) {
            trimmed = trimmed.substring(1);
        }
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    public String normalizedVaultNamespace() {
        if (vaultNamespace == null || vaultNamespace.isBlank()) {
            return "";
        }
        return vaultNamespace.trim();
    }

    public String normalizedVaultKeyName() {
        if (vaultKeyName == null || vaultKeyName.isBlank()) {
            return DEFAULT_VAULT_KEY_NAME;
        }
        return vaultKeyName.trim();
    }

    public Duration effectiveVaultConnectTimeout() {
        return vaultConnectTimeout == null ? DEFAULT_VAULT_CONNECT_TIMEOUT : vaultConnectTimeout;
    }

    public Duration effectiveVaultRequestTimeout() {
        return vaultRequestTimeout == null ? DEFAULT_VAULT_REQUEST_TIMEOUT : vaultRequestTimeout;
    }

    public byte[] decodedLocalEscrowSecret() {
        if (!hasLocalEscrowSecret()) {
            throw new IllegalStateException("Local escrow secret is not configured");
        }
        try {
            return Decoders.BASE64.decode(secret);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Failed to decode local escrow secret", exception);
        }
    }
}
