package com.north.messenger.api;

import com.north.messenger.api.dto.InviteAcceptanceResponse;
import com.north.messenger.api.dto.InviteLinkResponse;
import com.north.messenger.application.chat.InviteLinkService;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/invite-links")
public class InviteLinkController {

    private final InviteLinkService inviteLinkService;

    public InviteLinkController(InviteLinkService inviteLinkService) {
        this.inviteLinkService = inviteLinkService;
    }

    @PostMapping("/groups/{chatId}")
    public InviteLinkResponse createGroupInviteLink(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(defaultValue = "false") boolean refresh
    ) {
        return inviteLinkService.createGroupInviteLink(authentication.getName(), chatId, refresh);
    }

    @PostMapping("/conferences/{conferenceId}")
    public InviteLinkResponse createConferenceInviteLink(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @RequestParam(defaultValue = "false") boolean refresh
    ) {
        return inviteLinkService.createConferenceInviteLink(authentication.getName(), conferenceId, refresh);
    }

    @PostMapping("/{code}/accept")
    public InviteAcceptanceResponse acceptInvite(Authentication authentication, @PathVariable String code) {
        return inviteLinkService.acceptInvite(authentication.getName(), code);
    }
}
