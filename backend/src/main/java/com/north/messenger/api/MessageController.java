package com.north.messenger.api;

import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.DeleteMessagesRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.auth.PasswordPolicyViolationException;
import com.north.messenger.application.message.MessageSendDiagnostics;
import com.north.messenger.application.message.MessageService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/chats/{chatId}/messages")
public class MessageController {

    private final MessageService messageService;
    private final AuthService authService;

    public MessageController(MessageService messageService, AuthService authService) {
        this.messageService = messageService;
        this.authService = authService;
    }

    @GetMapping
    public List<MessageResponse> listMessages(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(required = false) Long beforeServerOrder,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "true") boolean acknowledgeDelivered
    ) {
        return messageService.listMessages(
                chatId,
                authentication.getName(),
                beforeServerOrder,
                limit,
                acknowledgeDelivered
        );
    }

    @PostMapping
    public MessageResponse createMessage(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID chatId,
            @Valid @RequestBody CreateMessageRequest request
    ) {
        String username = authentication.getName();
        String clientMessageId = request != null ? request.clientMessageId() : null;
        MessageSendDiagnostics.logIngress("http", chatId, username, clientMessageId);
        try {
            authService.requireAuthenticatedSession(
                    username,
                    extractBearerToken(authorization)
            );
            return messageService.sendMessage(chatId, username, request);
        } catch (ResponseStatusException exception) {
            MessageSendDiagnostics.logFailure(
                    "http",
                    "controller.rejected",
                    chatId,
                    null,
                    username,
                    clientMessageId,
                    exception.getStatusCode().value(),
                    exception.getReason() != null
                            ? exception.getReason()
                            : HttpStatus.valueOf(exception.getStatusCode().value()).getReasonPhrase(),
                    MessageSendDiagnostics.withServerStage("controller.rejected", List.of()),
                    exception
            );
            throw exception;
        } catch (PasswordPolicyViolationException exception) {
            MessageSendDiagnostics.logFailure(
                    "http",
                    "controller.password_policy",
                    chatId,
                    null,
                    username,
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    MessageSendDiagnostics.withServerStage("controller.password_policy", exception.getDetails()),
                    exception
            );
            throw exception;
        } catch (IllegalArgumentException exception) {
            MessageSendDiagnostics.logFailure(
                    "http",
                    "controller.bad_request",
                    chatId,
                    null,
                    username,
                    clientMessageId,
                    HttpStatus.BAD_REQUEST.value(),
                    exception.getMessage(),
                    MessageSendDiagnostics.withServerStage("controller.bad_request", List.of()),
                    exception
            );
            throw exception;
        } catch (RuntimeException exception) {
            MessageSendDiagnostics.logFailure(
                    "http",
                    "controller.unhandled",
                    chatId,
                    null,
                    username,
                    clientMessageId,
                    HttpStatus.INTERNAL_SERVER_ERROR.value(),
                    "Unexpected server error",
                    MessageSendDiagnostics.withServerStage("controller.unhandled", List.of(exception.getClass().getSimpleName())),
                    exception
            );
            throw exception;
        }
    }

    @PostMapping("/delivered")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acknowledgeDelivered(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody MessageReceiptRequest request
    ) {
        messageService.acknowledgeDelivered(chatId, authentication.getName(), request);
    }

    @PostMapping("/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acknowledgeRead(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody MessageReceiptRequest request
    ) {
        messageService.acknowledgeRead(chatId, authentication.getName(), request);
    }

    @DeleteMapping("/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable UUID messageId,
            @RequestParam(defaultValue = "EVERYONE") String scope
    ) {
        messageService.deleteMessage(chatId, messageId, authentication.getName(), scope);
    }

    @PostMapping("/delete-batch")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMessages(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody DeleteMessagesRequest request,
            @RequestParam(defaultValue = "EVERYONE") String scope
    ) {
        messageService.deleteMessages(chatId, request.messageIds(), authentication.getName(), scope);
    }

    @PutMapping("/{messageId}")
    public MessageResponse updateMessage(
            Authentication authentication,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID chatId,
            @PathVariable UUID messageId,
            @Valid @RequestBody UpdateMessageRequest request
    ) {
        authService.requireAuthenticatedSession(
                authentication.getName(),
                extractBearerToken(authorization)
        );
        return messageService.updateMessage(
                chatId,
                messageId,
                authentication.getName(),
                request
        );
    }

    @PutMapping("/{messageId}/reactions")
    public MessageReactionEventResponse toggleReaction(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable UUID messageId,
            @Valid @RequestBody ToggleMessageReactionRequest request
    ) {
        return messageService.toggleReaction(chatId, messageId, authentication.getName(), request);
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return "";
        }
        return authorization.substring(7);
    }
}

