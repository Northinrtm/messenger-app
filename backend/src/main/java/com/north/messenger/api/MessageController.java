package com.north.messenger.api;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageReceiptRequest;
import com.north.messenger.api.dto.MessageReactionEventResponse;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.api.dto.ToggleMessageReactionRequest;
import com.north.messenger.application.message.MessageService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;

@RestController
@RequestMapping("/api/chats/{chatId}/messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @GetMapping
    public List<MessageResponse> listMessages(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant before,
            @RequestParam(defaultValue = "50") int limit
    ) {
        return messageService.listMessages(chatId, authentication.getName(), before, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse sendMessage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody CreateMessageRequest request
    ) {
        return messageService.sendMessage(chatId, authentication.getName(), request);
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
            @PathVariable UUID messageId
    ) {
        messageService.deleteMessage(chatId, messageId, authentication.getName());
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
}

