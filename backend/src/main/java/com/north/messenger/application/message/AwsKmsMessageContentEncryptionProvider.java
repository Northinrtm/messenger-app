package com.north.messenger.application.message;

import jakarta.annotation.PreDestroy;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.kms.KmsClient;
import software.amazon.awssdk.services.kms.model.DataKeySpec;
import software.amazon.awssdk.services.kms.model.DecryptRequest;
import software.amazon.awssdk.services.kms.model.GenerateDataKeyRequest;

@Component
class AwsKmsMessageContentEncryptionProvider implements MessageContentEncryptionProvider {

    private static final String PROVIDER_NAME = "AWS_KMS";

    private final MessageContentEncryptionProperties properties;
    private volatile KmsClient kmsClient;

    AwsKmsMessageContentEncryptionProvider(MessageContentEncryptionProperties properties) {
        this.properties = properties;
    }

    @Override
    public String providerName() {
        return PROVIDER_NAME;
    }

    @Override
    public GeneratedDataKey generateDataKey() {
        String keyId = requireKeyId();
        var response = getOrCreateClient().generateDataKey(GenerateDataKeyRequest.builder()
                .keyId(keyId)
                .keySpec(DataKeySpec.AES_256)
                .build());
        return new GeneratedDataKey(
                response.ciphertextBlob().asByteArray(),
                new SecretKeySpec(response.plaintext().asByteArray(), "AES"),
                keyId
        );
    }

    @Override
    public SecretKey unwrapDataKey(byte[] encryptedDataKey, String keyReference) {
        var response = getOrCreateClient().decrypt(DecryptRequest.builder()
                .keyId(keyReference)
                .ciphertextBlob(SdkBytes.fromByteArray(encryptedDataKey))
                .build());
        return new SecretKeySpec(response.plaintext().asByteArray(), "AES");
    }

    @PreDestroy
    void shutdown() {
        KmsClient current = kmsClient;
        if (current != null) {
            current.close();
        }
    }

    private KmsClient getOrCreateClient() {
        KmsClient current = kmsClient;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (kmsClient == null) {
                var builder = KmsClient.builder()
                        .region(Region.of(properties.awsKms().region()))
                        .credentialsProvider(DefaultCredentialsProvider.create());
                if (properties.awsKms().endpointOverride() != null) {
                    builder.endpointOverride(properties.awsKms().endpointOverride());
                }
                kmsClient = builder.build();
            }
            return kmsClient;
        }
    }

    private String requireKeyId() {
        String keyId = properties.awsKms().keyId();
        if (keyId == null || keyId.isBlank()) {
            throw new IllegalStateException("AWS KMS key id is required for message content encryption");
        }
        return keyId;
    }
}
