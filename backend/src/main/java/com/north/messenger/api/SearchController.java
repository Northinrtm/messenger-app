package com.north.messenger.api;

import com.north.messenger.api.dto.WorkspaceSearchResponse;
import com.north.messenger.application.chat.WorkspaceSearchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
@Tag(name = "Search", description = "Workspace-wide search across chats, users, contacts, and conferences")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class SearchController {

    private final WorkspaceSearchService workspaceSearchService;

    public SearchController(WorkspaceSearchService workspaceSearchService) {
        this.workspaceSearchService = workspaceSearchService;
    }

    @GetMapping
    @Operation(
            summary = "Search the workspace",
            description = "Runs a backend search for the authenticated user and returns matching chats, users, contacts, and conferences."
    )
    public WorkspaceSearchResponse search(
            Authentication authentication,
            @Parameter(description = "Free-text workspace query. The backend expects at least two characters for meaningful results.")
            @RequestParam String query
    ) {
        return workspaceSearchService.search(authentication.getName(), query);
    }
}
