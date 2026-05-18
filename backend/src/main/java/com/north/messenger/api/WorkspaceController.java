package com.north.messenger.api;

import com.north.messenger.api.dto.WorkspaceBootstrapResponse;
import com.north.messenger.application.chat.WorkspaceBootstrapService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace")
@Tag(name = "Workspace", description = "Workspace bootstrap and shell data")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class WorkspaceController {

    private final WorkspaceBootstrapService workspaceBootstrapService;

    public WorkspaceController(WorkspaceBootstrapService workspaceBootstrapService) {
        this.workspaceBootstrapService = workspaceBootstrapService;
    }

    @GetMapping("/bootstrap")
    @Operation(
            summary = "Load workspace bootstrap",
            description = "Returns the authenticated user's initial workspace snapshot, including chats, contacts, conferences, drafts, blocks, and pending outgoing messages."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workspace bootstrap loaded successfully", useReturnTypeSchema = true)
    })
    public WorkspaceBootstrapResponse bootstrap(Authentication authentication) {
        return workspaceBootstrapService.load(authentication.getName());
    }
}
