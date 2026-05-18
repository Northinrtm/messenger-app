package com.north.messenger.api;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.message.TypingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}/typing")
@Tag(name = "Typing", description = "Current typing participants for a chat")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
        @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class TypingRestController {

    private final TypingService typingService;

    public TypingRestController(TypingService typingService) {
        this.typingService = typingService;
    }

    @GetMapping
    @Operation(
            summary = "List currently typing participants",
            description = "Returns the participants whose typing heartbeat is still active in the selected chat."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Typing participants returned successfully", useReturnTypeSchema = true)
    })
    public List<ParticipantResponse> listTypingParticipants(
            Authentication authentication,
            @Parameter(description = "Chat identifier whose live typing roster should be returned")
            @PathVariable UUID chatId
    ) {
        return typingService.listTypingParticipants(chatId, authentication.getName());
    }
}
