package com.north.messenger.application.message;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
public class MinioChatAttachmentStorage implements ChatAttachmentStorage {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final String bucket;
    private final boolean autoCreateBucket;
    private final Duration presignedUrlTtl;

    public MinioChatAttachmentStorage(ChatAttachmentStorageProperties properties) {
        ChatAttachmentStorageProperties.MinioProperties minio = properties.minio();
        if (minio == null || minio.endpoint() == null) {
            throw new IllegalStateException("MinIO endpoint is required for message attachment storage");
        }
        if (minio.publicEndpoint() == null) {
            throw new IllegalStateException("MinIO public endpoint is required for message attachment storage");
        }
        if (isBlank(minio.accessKey()) || isBlank(minio.secretKey()) || isBlank(minio.bucket())) {
            throw new IllegalStateException("MinIO credentials and bucket are required for message attachment storage");
        }

        this.bucket = minio.bucket().trim();
        this.autoCreateBucket = minio.autoCreateBucket();
        this.presignedUrlTtl = minio.presignedUrlTtl() == null || minio.presignedUrlTtl().isNegative()
                || minio.presignedUrlTtl().isZero()
                ? Duration.ofMinutes(10)
                : minio.presignedUrlTtl();

        StaticCredentialsProvider credentialsProvider = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(minio.accessKey().trim(), minio.secretKey().trim())
        );
        String region = isBlank(minio.region()) ? "us-east-1" : minio.region().trim();
        S3Configuration serviceConfiguration = S3Configuration.builder()
                .pathStyleAccessEnabled(minio.pathStyleAccess())
                .checksumValidationEnabled(false)
                .build();

        this.s3Client = S3Client.builder()
                .endpointOverride(minio.endpoint())
                .region(Region.of(region))
                .credentialsProvider(credentialsProvider)
                .serviceConfiguration(serviceConfiguration)
                .build();
        this.s3Presigner = S3Presigner.builder()
                .endpointOverride(minio.publicEndpoint())
                .region(Region.of(region))
                .credentialsProvider(credentialsProvider)
                .serviceConfiguration(serviceConfiguration)
                .build();
    }

    @PostConstruct
    void ensureBucketExists() {
        if (!autoCreateBucket) {
            return;
        }

        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (S3Exception exception) {
            int statusCode = exception.statusCode();
            if (statusCode != 404) {
                throw new IllegalStateException("Failed to check MinIO bucket state", exception);
            }
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
        }
    }

    public void deleteQuietly(String storageKey) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(storageKey).build());
        } catch (S3Exception ignored) {
            return;
        }
    }

    @Override
    public boolean exists(String storageKey) {
        try {
            s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(storageKey).build());
            return true;
        } catch (NoSuchKeyException exception) {
            return false;
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                return false;
            }
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to verify chat attachment",
                    exception
            );
        }
    }

    @Override
    public DirectUploadTarget createDirectUpload(
            UUID attachmentId,
            String fileName,
            String mimeType,
            long sizeBytes
    ) {
        String storageKey = createStorageKey(attachmentId);
        PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(
                PutObjectPresignRequest.builder()
                        .signatureDuration(presignedUrlTtl)
                        .putObjectRequest(PutObjectRequest.builder()
                                .bucket(bucket)
                                .key(storageKey)
                                .contentType(mimeType)
                                .build())
                        .build()
        );
        return new DirectUploadTarget(
                storageKey,
                java.net.URI.create(presignedRequest.url().toString()),
                "PUT",
                flattenHeaders(presignedRequest),
                Instant.now().plus(presignedUrlTtl)
        );
    }

    @Override
    public DirectDownloadTarget createDirectDownload(String storageKey, String fileName, String mimeType) {
        PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(
                GetObjectPresignRequest.builder()
                        .signatureDuration(presignedUrlTtl)
                        .getObjectRequest(GetObjectRequest.builder()
                                .bucket(bucket)
                                .key(storageKey)
                                .responseContentType(mimeType)
                                .build())
                        .build()
        );
        return new DirectDownloadTarget(
                java.net.URI.create(presignedRequest.url().toString()),
                Instant.now().plus(presignedUrlTtl)
        );
    }

    private Map<String, String> flattenHeaders(PresignedPutObjectRequest presignedRequest) {
        Map<String, String> headers = new LinkedHashMap<>();
        presignedRequest.httpRequest().headers().forEach((key, values) -> {
            if ("host".equalsIgnoreCase(key) || values == null || values.isEmpty()) {
                return;
            }
            headers.put(key, values.get(0));
        });
        return headers;
    }

    private String createStorageKey(UUID attachmentId) {
        return attachmentId + "-" + UUID.randomUUID() + ".bin";
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
