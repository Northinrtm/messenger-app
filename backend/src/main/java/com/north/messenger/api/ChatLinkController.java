package com.north.messenger.api;

import com.north.messenger.api.dto.ChatLinkBrowserPageResponse;
import com.north.messenger.application.message.ChatLinkBrowserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}/links")
@Tag(name = "Chat links", description = "Extracted links used by the shared chat media/link browser")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class ChatLinkController {

    private final ChatLinkBrowserService chatLinkBrowserService;

    public ChatLinkController(ChatLinkBrowserService chatLinkBrowserService) {
        this.chatLinkBrowserService = chatLinkBrowserService;
    }

    @GetMapping("/browser")
    @Operation(
            summary = "List extracted chat links for the shared media browser",
            description = "Returns a cursor-paged list of links extracted from messages in the selected chat."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatLinkBrowserPageResponse listLinkBrowserPage(
            Authentication authentication,
            @Parameter(description = "Chat whose extracted links should be returned")
            @PathVariable UUID chatId,
            @Parameter(description = "Opaque cursor returned by the previous browser page")
            @RequestParam(required = false) String cursor,
            @Parameter(description = "Maximum number of link items to return in one page")
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
