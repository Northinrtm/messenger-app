package com.north.messenger.api;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageSendErrorResponse;
import com.north.messenger.application.auth.PasswordPolicyViolationException;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.security.Principal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class MessageWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(MessageWebSocketController.class);
    private static final String MESSAGE_ERROR_DESTINATION = "/queue/message-errors";

    private final MessageService messageService;
    private final RealtimeMessagingGateway realtimeMessagingGateway;
    private final Validator validator;

    public MessageWebSocketController(
            MessageService messageService,
            RealtimeMessagingGateway realtimeMessagingGateway,
            Validator validator
    ) {
        this.messageService = messageService;
        this.realtimeMessagingGateway = realtimeMessagingGateway;
        this.validator = validator;
    }

    @MessageMapping("/chats/{chatId}/messages")
    public void sendMessage(
            Principal principal,
            @DestinationVariable UUID chatId,
            @Payload CreateMessageRequest request
    ) {
        if (principal == null) {
            return;
        }

        List<String> validationErrors = validate(request);
        if (!validationErrors.isEmpty()) {
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    request != null ? request.clientMessageId() : null,
                    HttpStatus.BAD_REQUEST.value(),
                    "Validation failed",
                    validationErrors
            ));
            return;
        }

        try {
            messageService.sendMessage(chatId, principal.getName(), request);
        } catch (ResponseStatusException exception) {
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    request.clientMessageId(),
                    exception.getStatusCode().value(),
                    exception.getReason() != null
                            ? exception.getReason()
                            : HttpStatus.valueOf(exception.getStatusCode().value()).getReasonPhrase(),
                    List.of()
            ));
        } catch (PasswordPolicyViolationException exception) {
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    request.clientMessageId(),
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    exception.getDetails()
            ));
        } catch (IllegalArgumentException exception) {
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    request.clientMessageId(),
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    List.of()
            ));
        } catch (RuntimeException exception) {
            log.error(
                    "Unhandled websocket message send error user={} chatId={} clientMessageId={}",
                    principal.getName(),
                    chatId,
                    request.clientMessageId(),
                    exception
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    request.clientMessageId(),
                    HttpStatus.INTERNAL_SERVER_ERROR.value(),
                    "Unexpected server error",
                    List.of(exception.getClass().getSimpleName())
            ));
        }
    }

    private List<String> validate(CreateMessageRequest request) {
        if (request == null) {
            return List.of("Request body is required");
        }

        Set<ConstraintViolation<CreateMessageRequest>> violations = validator.validate(request);
        if (violations.isEmpty()) {
            return List.of();
        }

        return violations.stream()
                .sorted(Comparator.comparing(violation -> violation.getPropertyPath().toString()))
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .toList();
    }

    private void sendError(String username, MessageSendErrorResponse error) {
        realtimeMessagingGateway.sendToUser(username, MESSAGE_ERROR_DESTINATION, error);
    }
}
