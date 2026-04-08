package com.north.messenger.application.chat;

import com.north.messenger.api.dto.ChatSummaryResponse;
import com.north.messenger.api.dto.InviteAcceptanceResponse;
import com.north.messenger.api.dto.InviteLinkResponse;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.InviteLink;
import com.north.messenger.domain.model.InviteLinkTargetType;
import com.north.messenger.domain.model.VideoConference;
import com.north.messenger.domain.repository.InviteLinkRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class InviteLinkService {

    private static final char PUBLIC_CODE_PREFIX = '+';
    private static final char[] CODE_ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".toCharArray();
    private static final int CODE_LENGTH = 16;
    private static final String RAW_CODE_PATTERN = "^[A-Za-z0-9]{16}$";
    private static final String PUBLIC_CODE_PATTERN = "^\\+[A-Za-z0-9]{16}$";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final InviteLinkRepository inviteLinkRepository;
    private final ChatService chatService;
    private final VideoConferenceService videoConferenceService;

    public InviteLinkService(
            InviteLinkRepository inviteLinkRepository,
            ChatService chatService,
            VideoConferenceService videoConferenceService
    ) {
        this.inviteLinkRepository = inviteLinkRepository;
        this.chatService = chatService;
        this.videoConferenceService = videoConferenceService;
    }

    @Transactional
    public InviteLinkResponse createGroupInviteLink(String username, UUID chatId, boolean refresh) {
        ChatRoom room = chatService.requireChatMembership(chatId, username);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chat links are not supported");
        }

        InviteLink inviteLink = createOrRefreshInviteLink(InviteLinkTargetType.GROUP, chatId, refresh);
        return new InviteLinkResponse(toPublicCode(inviteLink.getCode()));
    }

    @Transactional
    public InviteLinkResponse createConferenceInviteLink(String username, UUID conferenceId, boolean refresh) {
        VideoConference conference = videoConferenceService.requireConferenceInviteLinkAccess(username, conferenceId);
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }

        InviteLink inviteLink = createOrRefreshInviteLink(InviteLinkTargetType.CONFERENCE, conferenceId, refresh);
        return new InviteLinkResponse(toPublicCode(inviteLink.getCode()));
    }

    @Transactional
    public InviteAcceptanceResponse acceptInvite(String username, String rawCode) {
        String normalizedCode = normalizeCode(rawCode);
        InviteLink inviteLink = inviteLinkRepository.findByCode(normalizedCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite link was not found"));

        return switch (inviteLink.getTargetType()) {
            case GROUP -> {
                ChatSummaryResponse chat = chatService.joinGroupViaInvite(username, inviteLink.getTargetId());
                yield new InviteAcceptanceResponse(inviteLink.getTargetType().name(), chat, null);
            }
            case CONFERENCE -> {
                VideoConferenceResponse conference =
                        videoConferenceService.joinConferenceViaInvite(username, inviteLink.getTargetId());
                yield new InviteAcceptanceResponse(inviteLink.getTargetType().name(), null, conference);
            }
        };
    }

    private InviteLink findOrCreateInviteLink(InviteLinkTargetType targetType, UUID targetId) {
        InviteLink existingLink = inviteLinkRepository.findByTargetTypeAndTargetId(targetType, targetId)
                .orElse(null);
        if (existingLink == null) {
            return createInviteLink(targetType, targetId);
        }

        if (isCurrentRawCode(existingLink.getCode())) {
            return existingLink;
        }

        return rotateInviteLink(existingLink);
    }

    private InviteLink createOrRefreshInviteLink(InviteLinkTargetType targetType, UUID targetId, boolean refresh) {
        if (!refresh) {
            return findOrCreateInviteLink(targetType, targetId);
        }

        InviteLink existingLink = inviteLinkRepository.findByTargetTypeAndTargetId(targetType, targetId)
                .orElse(null);
        if (existingLink == null) {
            return createInviteLink(targetType, targetId);
        }

        return rotateInviteLink(existingLink);
    }

    private InviteLink createInviteLink(InviteLinkTargetType targetType, UUID targetId) {
        ResponseStatusException lastFailure = null;
        for (int attempt = 0; attempt < 8; attempt++) {
            String code = generateCode();
            if (inviteLinkRepository.existsByCode(code)) {
                continue;
            }

            try {
                return inviteLinkRepository.save(new InviteLink(
                        UUID.randomUUID(),
                        code,
                        targetType,
                        targetId,
                        Instant.now()
                ));
            } catch (DataIntegrityViolationException exception) {
                InviteLink existingLink = inviteLinkRepository.findByTargetTypeAndTargetId(targetType, targetId)
                        .orElse(null);
                if (existingLink != null) {
                    return existingLink;
                }

                lastFailure = new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Invite link already exists for this target",
                        exception
                );
            }
        }

        if (lastFailure != null) {
            throw lastFailure;
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate invite link");
    }

    private String generateCode() {
        StringBuilder builder = new StringBuilder(CODE_LENGTH);
        for (int index = 0; index < CODE_LENGTH; index++) {
            builder.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return builder.toString();
    }

    private String normalizeCode(String rawCode) {
        String normalized = rawCode == null ? "" : rawCode.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invite code is required");
        }

        if (!normalized.matches(PUBLIC_CODE_PATTERN)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invite code format is invalid");
        }

        return normalized.substring(1);
    }

    private InviteLink rotateInviteLink(InviteLink inviteLink) {
        ResponseStatusException lastFailure = null;
        for (int attempt = 0; attempt < 8; attempt++) {
            String code = generateCode();
            if (code.equals(inviteLink.getCode()) || inviteLinkRepository.existsByCode(code)) {
                continue;
            }

            try {
                inviteLink.rotate(code, Instant.now());
                return inviteLinkRepository.save(inviteLink);
            } catch (DataIntegrityViolationException exception) {
                lastFailure = new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Invite link already exists for this target",
                        exception
                );
            }
        }

        if (lastFailure != null) {
            throw lastFailure;
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to refresh invite link");
    }

    private boolean isCurrentRawCode(String code) {
        return code != null && code.matches(RAW_CODE_PATTERN);
    }

    private String toPublicCode(String code) {
        return PUBLIC_CODE_PREFIX + code;
    }
}
