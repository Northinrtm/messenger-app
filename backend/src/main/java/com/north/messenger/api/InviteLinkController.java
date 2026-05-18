package com.north.messenger.api;

import com.north.messenger.api.dto.InviteAcceptanceResponse;
import com.north.messenger.api.dto.InviteLinkResponse;
import com.north.messenger.application.chat.InviteLinkService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/invite-links")
@Tag(name = "Invite links", description = "Invite link generation and acceptance for groups and conferences")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class InviteLinkController {

    private final InviteLinkService inviteLinkService;

    public InviteLinkController(InviteLinkService inviteLinkService) {
        this.inviteLinkService = inviteLinkService;
    }

    @PostMapping("/groups/{chatId}")
    @Operation(
            summary = "Create or refresh a group invite link",
            description = "Returns the current group invite code or issues a fresh one when refresh=true."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public InviteLinkResponse createGroupInviteLink(
            Authentication authentication,
            @Parameter(description = "Group chat identifier that owns the invite link")
            @PathVariable UUID chatId,
            @Parameter(description = "When true, invalidates the previous code and generates a new one")
            @RequestParam(defaultValue = "false") boolean refresh
    ) {
        return inviteLinkService.createGroupInviteLink(authentication.getName(), chatId, refresh);
    }

    @PostMapping("/conferences/{conferenceId}")
    @Operation(
            summary = "Create or refresh a conference invite link",
            description = "Returns the current conference invite code or issues a fresh one when refresh=true."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public InviteLinkResponse createConferenceInviteLink(
            Authentication authentication,
            @Parameter(description = "Conference identifier that owns the invite link")
            @PathVariable UUID conferenceId,
            @Parameter(description = "When true, invalidates the previous code and generates a new one")
            @RequestParam(defaultValue = "false") boolean refresh
    ) {
        return inviteLinkService.createConferenceInviteLink(authentication.getName(), conferenceId, refresh);
    }

    @PostMapping("/{code}/accept")
    @Operation(
            summary = "Accept an invite link",
            description = "Consumes an invite code and joins the authenticated user to the linked group or conference."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public InviteAcceptanceResponse acceptInvite(Authentication authentication, @PathVariable String code) {
        return inviteLinkService.acceptInvite(authentication.getName(), code);
    }
}
