package com.north.messenger.api.dto;

public record ChatCapabilitiesResponse(
        boolean canEditGroup,
        boolean canDeleteGroup,
        boolean canManageInviteLink,
        boolean canAddMembers,
        boolean canManageRoles,
        boolean canModerateMembers,
        boolean canTogglePrejoinHistory,
        boolean canLeaveGroup
) {
}
