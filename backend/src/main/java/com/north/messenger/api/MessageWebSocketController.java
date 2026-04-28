package com.north.messenger.api;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.MessageSendErrorResponse;
import com.north.messenger.application.auth.PasswordPolicyViolationException;
import com.north.messenger.application.message.MessageSendDiagnostics;
import com.north.messenger.application.message.MessageService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.security.Principal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class MessageWebSocketController {

    private static final String MESSAGE_ACK_DESTINATION = "/queue/message-acks";
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

        String clientMessageId = request != null ? request.clientMessageId() : null;
        MessageSendDiagnostics.logIngress("websocket", chatId, principal.getName(), clientMessageId);

        List<String> validationErrors = validate(request);
        if (!validationErrors.isEmpty()) {
            List<String> diagnosticDetails = MessageSendDiagnostics.withServerStage(
                    "controller.validation",
                    validationErrors
            );
            MessageSendDiagnostics.logFailure(
                    "websocket",
                    "controller.validation",
                    chatId,
                    null,
                    principal.getName(),
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    "Validation failed",
                    diagnosticDetails,
                    null
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    "Validation failed",
                    diagnosticDetails
            ));
            return;
        }

        try {
            MessageResponse response = messageService.sendMessage(chatId, principal.getName(), request);
            realtimeMessagingGateway.sendToUser(principal.getName(), MESSAGE_ACK_DESTINATION, response);
        } catch (ResponseStatusException exception) {
            List<String> diagnosticDetails = MessageSendDiagnostics.withServerStage(
                    "service.rejected",
                    List.of()
            );
            MessageSendDiagnostics.logFailure(
                    "websocket",
                    "service.rejected",
                    chatId,
                    null,
                    principal.getName(),
                    clientMessageId,
                    exception.getStatusCode().value(),
                    exception.getReason() != null
                            ? exception.getReason()
                            : HttpStatus.valueOf(exception.getStatusCode().value()).getReasonPhrase(),
                    diagnosticDetails,
                    exception
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    clientMessageId,
                    exception.getStatusCode().value(),
                    exception.getReason() != null
                            ? exception.getReason()
                            : HttpStatus.valueOf(exception.getStatusCode().value()).getReasonPhrase(),
                    diagnosticDetails
            ));
        } catch (PasswordPolicyViolationException exception) {
            List<String> diagnosticDetails = MessageSendDiagnostics.withServerStage(
                    "service.password_policy",
                    exception.getDetails()
            );
            MessageSendDiagnostics.logFailure(
                    "websocket",
                    "service.password_policy",
                    chatId,
                    null,
                    principal.getName(),
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    diagnosticDetails,
                    exception
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    diagnosticDetails
            ));
        } catch (IllegalArgumentException exception) {
            List<String> diagnosticDetails = MessageSendDiagnostics.withServerStage(
                    "service.bad_request",
                    List.of()
            );
            MessageSendDiagnostics.logFailure(
                    "websocket",
                    "service.bad_request",
                    chatId,
                    null,
                    principal.getName(),
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    diagnosticDetails,
                    exception
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    diagnosticDetails
            ));
        } catch (RuntimeException exception) {
            List<String> diagnosticDetails = MessageSendDiagnostics.withServerStage(
                    "service.unhandled",
                    List.of(exception.getClass().getSimpleName())
            );
            MessageSendDiagnostics.logFailure(
                    "websocket",
                    "service.unhandled",
                    chatId,
                    null,
                    principal.getName(),
                    clientMessageId,
                    HttpStatus.INTERNAL_SERVER_ERROR.value(),
                    "Unexpected server error",
                    diagnosticDetails,
                    exception
            );
            sendError(principal.getName(), new MessageSendErrorResponse(
                    chatId,
                    clientMessageId,
                    HttpStatus.INTERNAL_SERVER_ERROR.value(),
                    "Unexpected server error",
                    diagnosticDetails
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
