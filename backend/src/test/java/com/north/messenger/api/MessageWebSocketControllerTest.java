package com.north.messenger.api;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.PlainMessagePayloadRequest;
import com.north.messenger.api.dto.PlainMessagePayloadResponse;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.security.AuthRateLimitDecision;
import com.north.messenger.security.AuthRateLimiter;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageWebSocketControllerTest {

    private MessageService messageService;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private MessageWebSocketController controller;

    @BeforeEach
    void setUp() {
        messageService = mock(MessageService.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        AuthRateLimiter rateLimiter = mock(AuthRateLimiter.class);
        when(rateLimiter.acquire(any(), any(), any(), any(long.class)))
                .thenReturn(new AuthRateLimitDecision(true, 0));
        controller = new MessageWebSocketController(messageService, realtimeMessagingGateway, validator, rateLimiter);
    }

    @Test
    void shouldAcknowledgeSenderImmediatelyAfterSuccessfulWebsocketSend() {
        UUID chatId = UUID.randomUUID();
        CreateMessageRequest request = new CreateMessageRequest(
                "client-message-id",
                null,
                new PlainMessagePayloadRequest("hello")
        );
        MessageResponse response = new MessageResponse(
                UUID.randomUUID(),
                chatId,
                101L,
                new ParticipantResponse(UUID.randomUUID(), "north", "North", null, true),
                Instant.parse("2026-04-25T13:04:55Z"),
                null,
                null,
                request.clientMessageId(),
                null,
                List.of(),
                false,
                null,
                new PlainMessagePayloadResponse("hello"),
                List.of()
        );
        Principal principal = () -> "north";

        when(messageService.sendMessage(chatId, "north", request)).thenReturn(response);

        controller.sendMessage(principal, chatId, request);

        verify(messageService).sendMessage(chatId, "north", request);
        verify(realtimeMessagingGateway).sendToUser("north", "/queue/message-acks", response);
    }

    @Test
    void shouldRejectInvalidPayloadBeforeCallingMessageService() {
        UUID chatId = UUID.randomUUID();
        CreateMessageRequest request = new CreateMessageRequest(
                " ",
                null,
                new PlainMessagePayloadRequest("hello")
        );
        Principal principal = () -> "north";

        controller.sendMessage(principal, chatId, request);

        verify(messageService, never()).sendMessage(chatId, "north", request);
        verify(realtimeMessagingGateway, never()).sendToUser(
                eq("north"),
                eq("/queue/message-acks"),
                any()
        );
        verify(realtimeMessagingGateway).sendToUser(
                eq("north"),
                eq("/queue/message-errors"),
                argThat(error ->
                        error instanceof com.north.messenger.api.dto.MessageSendErrorResponse response &&
                                response.chatId().equals(chatId) &&
                                response.clientMessageId().equals(" ") &&
                                response.status() == 400 &&
                                response.details().contains("serverStage=controller.validation")
                )
        );
    }

    @Test
    void shouldIncludeServerStageWhenServiceRejectsWebsocketSend() {
        UUID chatId = UUID.randomUUID();
        CreateMessageRequest request = new CreateMessageRequest(
                "client-message-id",
                null,
                new PlainMessagePayloadRequest("hello")
        );
        Principal principal = () -> "north";

        when(messageService.sendMessage(chatId, "north", request))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Message payload is invalid."));

        controller.sendMessage(principal, chatId, request);

        verify(realtimeMessagingGateway).sendToUser(
                eq("north"),
                eq("/queue/message-errors"),
                argThat(error ->
                        error instanceof com.north.messenger.api.dto.MessageSendErrorResponse response &&
                                response.chatId().equals(chatId) &&
                                response.clientMessageId().equals("client-message-id") &&
                                response.status() == 409 &&
                                response.details().contains("serverStage=service.rejected")
                )
        );
    }
}
