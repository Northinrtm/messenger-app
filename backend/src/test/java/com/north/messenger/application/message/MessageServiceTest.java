package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.EncryptedMessagePayloadRequest;
import com.north.messenger.api.dto.MessageDeliveryState;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageStatusEventResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatMessageRepository chatMessageRepository;
    private MessageReceiptRepository messageReceiptRepository;
    private UserAccountRepository userAccountRepository;
    private SimpMessagingTemplate messagingTemplate;
    private MessageService messageService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        messageReceiptRepository = mock(MessageReceiptRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        messageService = new MessageService(
                authService,
                chatService,
                chatMessageRepository,
                messageReceiptRepository,
                userAccountRepository,
                messagingTemplate,
                new ObjectMapper()
        );

        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageReceiptRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void sendMessageShouldReturnSentStatusForAuthor() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        new EncryptedMessagePayloadRequest(
                                "RSA-OAEP-256/AES-GCM",
                                "ciphertext-value",
                                "iv-value",
                                Map.of(
                                        currentUser.getId().toString(), "sender-wrapped-key",
                                        recipient.getId().toString(), "recipient-wrapped-key"
                                )
                        )
                )
        );

        assertThat(response.sender().id()).isEqualTo(currentUser.getId());
        assertThat(response.status()).isNotNull();
        assertThat(response.status().state()).isEqualTo(MessageDeliveryState.SENT);
        assertThat(response.status().recipientCount()).isEqualTo(1);
    }

    @Test
    void acknowledgeReadShouldNotifySenderAboutReadStatus() {
        UUID chatId = UUID.randomUUID();
        UserAccount sender = user("north");
        UserAccount reader = user("alice");
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                sender.getId(),
                "hello",
                Instant.parse("2026-03-24T12:00:00Z")
        );
        MessageReceipt receipt = new MessageReceipt(
                UUID.randomUUID(),
                message.getId(),
                reader.getId(),
                null,
                null
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(reader);
        when(messageReceiptRepository.findAllByUserIdAndChatIdAndMessageIdIn(
                reader.getId(),
                chatId,
                List.of(message.getId())
        )).thenReturn(List.of(receipt));
        when(chatMessageRepository.findAllById(List.of(message.getId()))).thenReturn(List.of(message));
        when(messageReceiptRepository.findAllByMessageIdIn(List.of(message.getId()))).thenReturn(List.of(receipt));
        when(userAccountRepository.findAllByIdIn(List.of(sender.getId()))).thenReturn(List.of(sender));

        messageService.acknowledgeRead(chatId, "alice", new MessageReceiptRequest(List.of(message.getId())));

        ArgumentCaptor<MessageStatusEventResponse> eventCaptor = ArgumentCaptor.forClass(MessageStatusEventResponse.class);
        verify(messagingTemplate).convertAndSendToUser(eq("north"), eq("/queue/message-statuses"), eventCaptor.capture());
        verify(chatService).notifyChatUpdated(chatId);
        assertThat(eventCaptor.getValue().status().state()).isEqualTo(MessageDeliveryState.READ);
    }

    @Test
    void sendMessageShouldStoreEncryptedPayloadWithoutPlaintext() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));
        when(authService.toParticipant(currentUser)).thenReturn(participant(currentUser));

        MessageResponse response = messageService.sendMessage(
                chatId,
                "north",
                new CreateMessageRequest(
                        new EncryptedMessagePayloadRequest(
                                "RSA-OAEP-256/AES-GCM",
                                "ciphertext-value",
                                "iv-value",
                                Map.of(
                                        currentUser.getId().toString(), "sender-wrapped-key",
                                        recipient.getId().toString(), "recipient-wrapped-key"
                                )
                        )
                )
        );

        assertThat(response.encryptedPayload()).isNotNull();
        assertThat(response.encryptedPayload().ciphertext()).isEqualTo("ciphertext-value");
        assertThat(response.encryptedPayload().encryptedKey()).isEqualTo("sender-wrapped-key");
    }

    @Test
    void sendMessageShouldRejectMissingEncryptedPayload() {
        UUID chatId = UUID.randomUUID();
        UserAccount currentUser = user("north");
        UserAccount recipient = user("alice");
        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, recipient));

        assertThatThrownBy(() -> messageService.sendMessage(chatId, "north", new CreateMessageRequest(null)))
                .hasMessageContaining("End-to-end encrypted payload is required");
    }

    private UserAccount user(String username) {
        return new UserAccount(
                UUID.randomUUID(),
                username,
                username.toUpperCase(),
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
    }

    private ParticipantResponse participant(UserAccount user) {
        return new ParticipantResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                true
        );
    }
}
