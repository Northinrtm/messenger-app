package com.north.messenger.application.message;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.messages.content-encryption")
public record MessageContentEncryptionProperties(
        Provider provider,
        Duration dekCacheTtl,
        String localMasterKeyBase64,
        AwsKmsProperties awsKms
) {
    public MessageContentEncryptionProperties {
        provider = provider == null ? Provider.LOCAL : provider;
        dekCacheTtl = dekCacheTtl == null ? Duration.ofMinutes(10) : dekCacheTtl;
        localMasterKeyBase64 = localMasterKeyBase64 == null ? "" : localMasterKeyBase64.trim();
        awsKms = awsKms == null ? new AwsKmsProperties(null, "us-east-1", null) : awsKms;
    }

    public enum Provider {
        LOCAL,
        AWS_KMS
    }

    public record AwsKmsProperties(
            String keyId,
            String region,
            URI endpointOverride
    ) {
    }
}
