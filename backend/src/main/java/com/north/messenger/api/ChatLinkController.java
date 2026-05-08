package com.north.messenger.api;

import com.north.messenger.api.dto.ChatLinkBrowserPageResponse;
import com.north.messenger.application.message.ChatLinkBrowserService;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}/links")
public class ChatLinkController {

    private final ChatLinkBrowserService chatLinkBrowserService;

    public ChatLinkController(ChatLinkBrowserService chatLinkBrowserService) {
        this.chatLinkBrowserService = chatLinkBrowserService;
    }

    @GetMapping("/browser")
    @Operation(summary = "List extracted chat links for the shared media browser")
    public ChatLinkBrowserPageResponse listLinkBrowserPage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "60") int limit
    ) {
        return chatLinkBrowserService.listLinkBrowserPage(
                chatId,
                authentication.getName(),
                cursor,
                limit
        );
    }
}
