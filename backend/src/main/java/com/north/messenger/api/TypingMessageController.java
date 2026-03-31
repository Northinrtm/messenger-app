package com.north.messenger.api;

import com.north.messenger.api.dto.TypingEventRequest;
import com.north.messenger.application.message.TypingService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.UUID;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

@Controller
public class TypingMessageController {

    private final TypingService typingService;

    public TypingMessageController(TypingService typingService) {
        this.typingService = typingService;
    }

    @MessageMapping("/chats/{chatId}/typing")
    public void publishTyping(
            Principal principal,
            @DestinationVariable UUID chatId,
            @Valid @Payload TypingEventRequest request
    ) {
        if (principal == null) {
            return;
        }

        typingService.publishTyping(chatId, principal.getName(), request.typing());
    }
}
