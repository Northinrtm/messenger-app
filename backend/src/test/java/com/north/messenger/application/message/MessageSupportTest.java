package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.e2ee.DeviceEnvelopeCounterService;
import com.north.messenger.application.e2ee.DeviceKeyValidationService;
import com.north.messenger.domain.repository.ChatGroupSenderKeyCounterRepository;
import com.north.messenger.domain.repository.ChatMessageRecipientPayloadRepository;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionEnvelopeCounterRepository;
import com.north.messenger.domain.repository.UserEncryptionOneTimePrekeyRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
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
        DeviceKeyValidationService deviceKeyValidationService = new DeviceKeyValidationService(objectMapper);
        DeviceEnvelopeCounterService deviceEnvelopeCounterService =
                new DeviceEnvelopeCounterService(mock(UserEncryptionEnvelopeCounterRepository.class));
        messageSupport = new MessageSupport(
                mock(AuthService.class),
                mock(ChatMessageRepository.class),
                mock(ChatMessageRecipientPayloadRepository.class),
                mock(MessageReceiptRepository.class),
                mock(MessageReactionRepository.class),
                mock(UserAccountRepository.class),
                mock(UserEncryptionDeviceRepository.class),
                mock(UserEncryptionOneTimePrekeyRepository.class),
                mock(UserEncryptionSignedPrekeyRepository.class),
                mock(ChatGroupSenderKeyCounterRepository.class),
                deviceEnvelopeCounterService,
                deviceKeyValidationService,
                mock(MessengerTelemetry.class),
                objectMapper
        );
    }

    @Test
    void toEncryptedPayloadShouldReturnDirectHistoryEnvelopeWhenCurrentDevicePayloadIsMissing() {
        UUID senderId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        String historyEnvelope = """
                {"aadVersion":1,"historyKeyId":"%s","senderDeviceId":"sender-device","ciphertext":"Y2lwaGVydGV4dA==","iv":"MDEyMzQ1Njc4OTAx"}
                """.formatted(UUID.randomUUID());
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderId,
                "ciphertext",
                "X3DH-DEVICE-AES-GCM",
                "iv",
                null,
                UUID.randomUUID(),
                historyEnvelope,
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        var response = messageSupport.toEncryptedPayload(
                message,
                UUID.randomUUID(),
                Map.of("older-device", "{\"wrapped\":true}"),
                Set.of("current-device"),
                false
        );

        assertThat(response.scheme()).isEqualTo("X3DH-DEVICE-AES-GCM");
        assertThat(response.encryptedKeysByRecipientId()).isEmpty();
        assertThat(response.historyEnvelope()).isEqualTo(historyEnvelope);
    }

    @Test
    void toEncryptedPayloadShouldStillRejectDirectMessagesWithoutVisiblePayloadOrHistoryEnvelope() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "ciphertext",
                "X3DH-DEVICE-AES-GCM",
                "iv",
                null,
                null,
                null,
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThatThrownBy(() -> messageSupport.toEncryptedPayload(
                message,
                UUID.randomUUID(),
                Map.of("older-device", "{\"wrapped\":true}"),
                Set.of("current-device"),
                false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Encrypted direct payload is missing");
    }
}
