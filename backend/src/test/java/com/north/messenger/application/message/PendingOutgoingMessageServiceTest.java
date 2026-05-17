package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.PendingOutgoingMessageAttachmentPayload;
import com.north.messenger.api.dto.UpsertPendingOutgoingMessageRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.PendingOutgoingMessageStatus;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserPendingOutgoingMessage;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserPendingOutgoingMessageRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PendingOutgoingMessageServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private UserAccountRepository userAccountRepository;
    private UserDeletedChatRepository userDeletedChatRepository;
    private UserPendingOutgoingMessageRepository userPendingOutgoingMessageRepository;
    private PendingOutgoingMessageService pendingOutgoingMessageService;
    private UserAccount currentUser;
    private UUID chatId;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedChatRepository = mock(UserDeletedChatRepository.class);
        userPendingOutgoingMessageRepository = mock(UserPendingOutgoingMessageRepository.class);
        pendingOutgoingMessageService = new PendingOutgoingMessageService(
                authService,
                chatService,
                userAccountRepository,
                userDeletedChatRepository,
                userPendingOutgoingMessageRepository,
                new ObjectMapper()
        );

        chatId = UUID.randomUUID();
        currentUser = testUserAccount(
                UUID.randomUUID(),
                "north",
                "North",
                "hash",
                Instant.parse("2026-04-01T00:00:00Z")
        );

        when(authService.requireAuthenticatedUser("north")).thenReturn(currentUser);
        when(userAccountRepository.findByIdForUpdate(currentUser.getId())).thenReturn(Optional.of(currentUser));
        when(chatService.requireChatMembership(chatId, currentUser))
                .thenReturn(new ChatRoom(chatId, null, true, Instant.parse("2026-04-01T00:00:00Z")));
        when(userDeletedChatRepository.findByUserIdAndChatId(currentUser.getId(), chatId)).thenReturn(Optional.empty());
        when(userPendingOutgoingMessageRepository.save(any(UserPendingOutgoingMessage.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void upsertOwnPendingOutgoingMessageShouldLockCurrentUserBeforeLookup() {
        Instant createdAt = Instant.parse("2026-05-08T13:10:04Z");
        UUID forwardedFromMessageId = UUID.randomUUID();
        when(userPendingOutgoingMessageRepository.findByUserIdAndClientMessageId(currentUser.getId(), "client-1"))
                .thenReturn(Optional.empty());

        var response = pendingOutgoingMessageService.upsertOwnPendingOutgoingMessage(
                "north",
                "client-1",
                new UpsertPendingOutgoingMessageRequest(
                        chatId,
                        "hello",
                        createdAt,
                        7L,
                        1,
                        null,
                        forwardedFromMessageId,
                        "FAILED",
                        List.of(new PendingOutgoingMessageAttachmentPayload("att-1", "spec.pdf", "application/pdf", 42))
                )
        );

        InOrder inOrder = inOrder(userAccountRepository, userPendingOutgoingMessageRepository);
        inOrder.verify(userAccountRepository).findByIdForUpdate(currentUser.getId());
        inOrder.verify(userPendingOutgoingMessageRepository)
                .findByUserIdAndClientMessageId(currentUser.getId(), "client-1");
        verify(userPendingOutgoingMessageRepository).save(any(UserPendingOutgoingMessage.class));
        assertThat(response.chatId()).isEqualTo(chatId);
        assertThat(response.clientMessageId()).isEqualTo("client-1");
        assertThat(response.content()).isEqualTo("hello");
        assertThat(response.forwardedFromMessageId()).isEqualTo(forwardedFromMessageId);
        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.attachments())
                .containsExactly(new PendingOutgoingMessageAttachmentPayload("att-1", "spec.pdf", "application/pdf", 42));
    }

    @Test
    void upsertOwnPendingOutgoingMessageShouldUpdateExistingEntryForSameClientMessageId() {
        Instant originalCreatedAt = Instant.parse("2026-05-08T13:00:00Z");
        Instant updatedAt = Instant.parse("2026-05-08T13:10:04Z");
        UUID forwardedFromMessageId = UUID.randomUUID();
        UserPendingOutgoingMessage existing = new UserPendingOutgoingMessage(
                UUID.randomUUID(),
                currentUser.getId(),
                chatId,
                "client-2",
                "before",
                originalCreatedAt,
                2L,
                1,
                null,
                null,
                PendingOutgoingMessageStatus.SENDING,
                "[]",
                originalCreatedAt
        );
        when(userPendingOutgoingMessageRepository.findByUserIdAndClientMessageId(currentUser.getId(), "client-2"))
                .thenReturn(Optional.of(existing));

        var response = pendingOutgoingMessageService.upsertOwnPendingOutgoingMessage(
                "north",
                "client-2",
                new UpsertPendingOutgoingMessageRequest(
                        chatId,
                        "after",
                        updatedAt,
                        8L,
                        3,
                        null,
                        forwardedFromMessageId,
                        "FAILED",
                        List.of()
                )
        );

        verify(userPendingOutgoingMessageRepository).save(eq(existing));
        assertThat(existing.getContent()).isEqualTo("after");
        assertThat(existing.getCreatedAt()).isEqualTo(updatedAt);
        assertThat(existing.getLocalOrder()).isEqualTo(8L);
        assertThat(existing.getRecipientCount()).isEqualTo(3);
        assertThat(existing.getForwardedFromMessageId()).isEqualTo(forwardedFromMessageId);
        assertThat(existing.getStatus()).isEqualTo(PendingOutgoingMessageStatus.FAILED);
        assertThat(response.clientMessageId()).isEqualTo("client-2");
        assertThat(response.content()).isEqualTo("after");
        assertThat(response.forwardedFromMessageId()).isEqualTo(forwardedFromMessageId);
        assertThat(response.status()).isEqualTo("FAILED");
    }
}
