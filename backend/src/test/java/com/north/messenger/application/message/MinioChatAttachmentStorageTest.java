package com.north.messenger.application.message;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;

class MinioChatAttachmentStorageTest {

    @Test
    void presignerEndpointShouldDropPublicPathPrefix() {
        URI publicEndpoint = URI.create("https://pishi.ktsf.ru/storage");

        URI presignerEndpoint = MinioChatAttachmentStorage.toPresignerEndpoint(publicEndpoint);

        assertThat(presignerEndpoint).isEqualTo(URI.create("https://pishi.ktsf.ru"));
    }

    @Test
    void publicObjectUrlShouldRestorePublicPathPrefix() {
        URI signedUrl = URI.create(
                "https://pishi.ktsf.ru/message-attachments/file.bin?X-Amz-Signature=test&X-Amz-Date=20260510T051230Z"
        );
        URI publicEndpoint = URI.create("https://pishi.ktsf.ru/storage");

        URI publicUrl = MinioChatAttachmentStorage.toPublicObjectUrl(signedUrl, publicEndpoint);

        assertThat(publicUrl).isEqualTo(URI.create(
                "https://pishi.ktsf.ru/storage/message-attachments/file.bin?X-Amz-Signature=test&X-Amz-Date=20260510T051230Z"
        ));
    }

    @Test
    void publicObjectUrlShouldPreserveRootEndpointWithoutPrefix() {
        URI signedUrl = URI.create("https://cdn.example.com/message-attachments/file.bin?X-Amz-Signature=test");
        URI publicEndpoint = URI.create("https://cdn.example.com");

        URI publicUrl = MinioChatAttachmentStorage.toPublicObjectUrl(signedUrl, publicEndpoint);

        assertThat(publicUrl).isEqualTo(signedUrl);
    }
}
