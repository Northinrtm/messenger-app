package com.north.messenger.api;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.TypingEventRequest;
import com.north.messenger.application.message.TypingService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
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

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void publishTyping(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody TypingEventRequest request
    ) {
        typingService.publishTyping(chatId, authentication.getName(), request.typing());
    }
}
