package com.north.messenger.api;

import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessagePageResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.api.dto.UpdateMessageRequest;
import com.north.messenger.api.dto.DeleteMessagesRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.message.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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

@RestController
@RequestMapping("/api/chats/{chatId}/messages")
@Tag(name = "Messages", description = "REST message history, receipts, updates, deletions, and reactions")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class MessageController {

    private final MessageService messageService;
    private final AuthService authService;

    public MessageController(MessageService messageService, AuthService authService) {
        this.messageService = messageService;
        this.authService = authService;
    }

    @GetMapping
    @Operation(
            summary = "List recent messages",
            description = "Returns recent messages from the selected chat, optionally paged backward from a server-order anchor."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public List<MessageResponse> listMessages(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Parameter(description = "Return messages older than this server order. Omit to read from the newest messages.")
            @RequestParam(required = false) Long beforeServerOrder,
            @Parameter(description = "Maximum number of messages to return")
            @RequestParam(defaultValue = "50") int limit,
            @Parameter(description = "When true, delivered receipts are acknowledged for the returned messages")
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

    @GetMapping("/page")
    @Operation(
            summary = "List one cursor-paged message page",
            description = "Returns one opaque cursor-based page of chat history and the cursor for the next page."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public MessagePageResponse listMessagePage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Parameter(description = "Opaque cursor returned by a previous page response")
            @RequestParam(required = false) String cursor,
            @Parameter(description = "Maximum number of messages to return")
            @RequestParam(defaultValue = "50") int limit,
            @Parameter(description = "When true, delivered receipts are acknowledged for the returned page")
            @RequestParam(defaultValue = "true") boolean acknowledgeDelivered
    ) {
        return messageService.listMessagePage(
                chatId,
                authentication.getName(),
                cursor,
                limit,
                acknowledgeDelivered
        );
    }

    @PostMapping("/delivered")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Acknowledge delivered receipts", description = "Marks one or more messages as delivered for the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void acknowledgeDelivered(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody MessageReceiptRequest request
    ) {
        messageService.acknowledgeDelivered(chatId, authentication.getName(), request);
    }

    @PostMapping("/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Acknowledge read receipts", description = "Marks one or more messages as read for the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void acknowledgeRead(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody MessageReceiptRequest request
    ) {
        messageService.acknowledgeRead(chatId, authentication.getName(), request);
    }

    @DeleteMapping("/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Delete one message",
            description = "Deletes one message either for everyone or only for the current user, depending on the scope query parameter."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void deleteMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable UUID messageId,
            @Parameter(description = "Deletion scope. Typical values are EVERYONE and SELF.")
            @RequestParam(defaultValue = "EVERYONE") String scope
    ) {
        messageService.deleteMessage(chatId, messageId, authentication.getName(), scope);
    }

    @PostMapping("/delete-batch")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Delete multiple messages",
            description = "Deletes a batch of messages using the same deletion scope semantics as the single-message delete endpoint."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public void deleteMessages(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody DeleteMessagesRequest request,
            @Parameter(description = "Deletion scope. Typical values are EVERYONE and SELF.")
            @RequestParam(defaultValue = "EVERYONE") String scope
    ) {
        messageService.deleteMessages(chatId, request.messageIds(), authentication.getName(), scope);
    }

    @PutMapping("/{messageId}")
    @Operation(
            summary = "Edit a message",
            description = "Updates one existing message payload. The access token in the Authorization header must belong to the authenticated session."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
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
    @Operation(summary = "Toggle a reaction", description = "Adds or removes the selected reaction for the authenticated user and returns the updated aggregate reaction event.")
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
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

