package com.north.messenger.api;

import com.north.messenger.api.dto.WorkspaceSearchResponse;
import com.north.messenger.application.chat.WorkspaceSearchService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final WorkspaceSearchService workspaceSearchService;

    public SearchController(WorkspaceSearchService workspaceSearchService) {
        this.workspaceSearchService = workspaceSearchService;
    }

    @GetMapping
    public WorkspaceSearchResponse search(
            Authentication authentication,
            @RequestParam String query
    ) {
        return workspaceSearchService.search(authentication.getName(), query);
    }
}
