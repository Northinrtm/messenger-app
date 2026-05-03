package com.north.messenger.api;

import com.north.messenger.api.dto.PendingOutgoingMessageResponse;
import com.north.messenger.api.dto.UpsertPendingOutgoingMessageRequest;
import com.north.messenger.application.message.PendingOutgoingMessageService;
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
public class PendingOutgoingMessageController {

    private final PendingOutgoingMessageService pendingOutgoingMessageService;

    public PendingOutgoingMessageController(PendingOutgoingMessageService pendingOutgoingMessageService) {
        this.pendingOutgoingMessageService = pendingOutgoingMessageService;
    }

    @GetMapping
    public List<PendingOutgoingMessageResponse> listPendingOutgoingMessages(Authentication authentication) {
        return pendingOutgoingMessageService.listOwnPendingOutgoingMessages(authentication.getName());
    }

    @PutMapping("/{clientMessageId}")
    public PendingOutgoingMessageResponse upsertPendingOutgoingMessage(
            Authentication authentication,
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
    public void deletePendingOutgoingMessage(
            Authentication authentication,
            @PathVariable String clientMessageId
    ) {
        pendingOutgoingMessageService.deleteOwnPendingOutgoingMessage(authentication.getName(), clientMessageId);
    }
}
