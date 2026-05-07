package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MessagePreviewServiceTest {

    private ChatAttachmentRepository chatAttachmentRepository;
    private MessageContentCryptoService messageContentCryptoService;
    private MessagePreviewService previewService;

    @BeforeEach
    void setUp() {
        chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        messageContentCryptoService = mock(MessageContentCryptoService.class);
        when(messageContentCryptoService.requirePlainContent(any(ChatMessage.class))).thenAnswer(invocation -> {
            ChatMessage message = invocation.getArgument(0);
            return message.getContent();
        });
        previewService = new MessagePreviewService(chatAttachmentRepository, messageContentCryptoService);
    }

    @Test
    void summarizeMessagePreviewShouldReturnReadableText() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Plain server-trusted message",
                Instant.parse("2026-05-03T11:20:00Z")
        );

        assertThat(previewService.summarizeMessagePreview(message))
                .isEqualTo("Plain server-trusted message");
    }

    @Test
    void summarizeMessagePreviewShouldDescribeAttachmentOnlyMessage() {
        UUID messageId = UUID.randomUUID();
        ChatMessage message = new ChatMessage(
                messageId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "",
                Instant.parse("2026-05-03T11:15:00Z")
        );
        when(chatAttachmentRepository.findAllByMessageId(messageId)).thenReturn(List.of(
                new ChatAttachment(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "report.pdf",
                        "report.pdf",
                        "application/pdf",
                        1024L,
                        Instant.parse("2026-05-03T11:14:00Z")
                )
        ));

        assertThat(previewService.summarizeMessagePreview(message))
                .isEqualTo("File: report.pdf");
    }

    @Test
    void summarizeMessagePreviewShouldFallbackToRawText() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "raw text preview",
                Instant.parse("2026-05-03T11:20:00Z")
        );

        assertThat(previewService.summarizeMessagePreview(message)).isEqualTo("raw text preview");
    }
}
