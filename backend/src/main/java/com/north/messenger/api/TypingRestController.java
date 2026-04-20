package com.north.messenger.api;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.message.TypingService;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}/typing")
public class TypingRestController {

    private final TypingService typingService;

    public TypingRestController(TypingService typingService) {
        this.typingService = typingService;
    }

    @GetMapping
    public List<ParticipantResponse> listTypingParticipants(
            Authentication authentication,
            @PathVariable UUID chatId
    ) {
        return typingService.listTypingParticipants(chatId, authentication.getName());
    }
}
