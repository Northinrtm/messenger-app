package com.north.messenger.api;

import com.north.messenger.api.dto.WorkspaceBootstrapResponse;
import com.north.messenger.application.chat.WorkspaceBootstrapService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {

    private final WorkspaceBootstrapService workspaceBootstrapService;

    public WorkspaceController(WorkspaceBootstrapService workspaceBootstrapService) {
        this.workspaceBootstrapService = workspaceBootstrapService;
    }

    @GetMapping("/bootstrap")
    public WorkspaceBootstrapResponse bootstrap(Authentication authentication) {
        return workspaceBootstrapService.load(authentication.getName());
    }
}
