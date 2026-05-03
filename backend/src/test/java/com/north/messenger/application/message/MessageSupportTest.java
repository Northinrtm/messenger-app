package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class MessageSupportTest {

    private MessageSupport messageSupport;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        messageSupport = new MessageSupport(
                mock(AuthService.class),
                mock(ChatMessageRepository.class),
                mock(MessageReceiptRepository.class),
                mock(MessageReactionRepository.class),
                mock(UserAccountRepository.class),
                mock(MessengerTelemetry.class),
                objectMapper,
                mock(EncryptedMessagePreviewService.class)
        );
    }

    @Test
    void toEncryptedPayloadShouldReturnChatEpochEnvelope() {
        UUID senderId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        String sharedEnvelope = """
                {"aadVersion":1,"chatId":"%s","senderUserId":"%s","historyKeyId":"%s","ciphertext":"Y2lwaGVydGV4dA==","iv":"MDEyMzQ1Njc4OTAx"}
                """.formatted(chatId, senderId, UUID.randomUUID());
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderId,
                sharedEnvelope,
                "CHAT-EPOCH-KEY-AES-GCM",
                "MDEyMzQ1Njc4OTAx",
                UUID.randomUUID(),
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        var response = messageSupport.toEncryptedPayload(message);

        assertThat(response.scheme()).isEqualTo("CHAT-EPOCH-KEY-AES-GCM");
        assertThat(response.sharedEnvelope()).isEqualTo(sharedEnvelope);
    }

    @Test
    void toEncryptedPayloadShouldRejectNonEncryptedChatEpochMessages() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv",
                UUID.randomUUID(),
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThatThrownBy(() -> messageSupport.toEncryptedPayload(message))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Encrypted chat epoch envelope is missing");
    }

    @Test
    void toEncryptedPayloadShouldRejectUnsupportedEncryptedMessageScheme() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "ciphertext",
                "UNSUPPORTED-SCHEME",
                "iv",
                null,
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThatThrownBy(() -> messageSupport.toEncryptedPayload(message))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported encrypted message scheme");
    }
}
