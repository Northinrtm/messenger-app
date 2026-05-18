package com.north.messenger.api;

import com.north.messenger.api.dto.PendingOutgoingMessageResponse;
import com.north.messenger.api.dto.UpsertPendingOutgoingMessageRequest;
import com.north.messenger.application.message.PendingOutgoingMessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/messages/pending-outgoing")
@Tag(name = "Pending outgoing", description = "Persistence for optimistic mobile/web messages that still wait for realtime confirmation")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class PendingOutgoingMessageController {

    private final PendingOutgoingMessageService pendingOutgoingMessageService;

    public PendingOutgoingMessageController(PendingOutgoingMessageService pendingOutgoingMessageService) {
        this.pendingOutgoingMessageService = pendingOutgoingMessageService;
    }

    @GetMapping
    @Operation(
            summary = "List pending outgoing messages",
            description = "Returns the authenticated user's locally persisted optimistic messages that have not yet been fully confirmed by realtime delivery."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pending outgoing messages returned successfully", useReturnTypeSchema = true)
    })
    public List<PendingOutgoingMessageResponse> listPendingOutgoingMessages(Authentication authentication) {
        return pendingOutgoingMessageService.listOwnPendingOutgoingMessages(authentication.getName());
    }

    @PutMapping("/{clientMessageId}")
    @Operation(
            summary = "Create or update a pending outgoing message",
            description = "Upserts one pending message keyed by the client-generated message id. Used by mobile/web clients to restore optimistic sends across reconnects or restarts."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pending outgoing message stored successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public PendingOutgoingMessageResponse upsertPendingOutgoingMessage(
            Authentication authentication,
            @Parameter(description = "Client-generated id that uniquely identifies the optimistic message on the caller side")
            @PathVariable String clientMessageId,
            @Valid @RequestBody UpsertPendingOutgoingMessageRequest request
    ) {
        return pendingOutgoingMessageService.upsertOwnPendingOutgoingMessage(
                authentication.getName(),
                clientMessageId,
                request
        );
    }

    @DeleteMapping("/{clientMessageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            summary = "Delete a pending outgoing message",
            description = "Removes one optimistic message after it is confirmed, cancelled, or discarded by the caller."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Pending outgoing message deleted successfully")
    })
    public void deletePendingOutgoingMessage(
            Authentication authentication,
            @Parameter(description = "Client-generated id of the pending message to delete")
            @PathVariable String clientMessageId
    ) {
        pendingOutgoingMessageService.deleteOwnPendingOutgoingMessage(authentication.getName(), clientMessageId);
    }
}
