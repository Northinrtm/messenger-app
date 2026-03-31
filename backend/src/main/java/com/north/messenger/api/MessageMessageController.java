package com.north.messenger.api;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.application.message.MessageService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.UUID;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

@Controller
public class MessageMessageController {

    private final MessageService messageService;

    public MessageMessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @MessageMapping("/chats/{chatId}/messages")
    public void sendMessage(
            Principal principal,
            @DestinationVariable UUID chatId,
            @Valid @Payload CreateMessageRequest request
    ) {
        if (principal == null) {
            return;
        }

        messageService.sendMessage(chatId, principal.getName(), request);
    }
}
