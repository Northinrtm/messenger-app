package com.north.messenger.application.chat;

import com.north.messenger.api.dto.AddConferenceParticipantsRequest;
import com.north.messenger.api.dto.CreateVideoConferenceRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.UpdateVideoConferenceRequest;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.ConferenceRecording;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.VideoConference;
import com.north.messenger.domain.model.VideoConferenceAttendance;
import com.north.messenger.domain.model.VideoConferenceParticipant;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomBanRepository;
import com.north.messenger.domain.repository.ConferenceRecordingRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.VideoConferenceAttendanceRepository;
import com.north.messenger.domain.repository.VideoConferenceParticipantRepository;
import com.north.messenger.domain.repository.VideoConferenceRepository;
import com.north.messenger.security.JwtProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class VideoConferenceService {

    private static final long ROOM_ACTIVATION_LEAD_MINUTES = 5;
    private static final long CONFERENCE_PRESENCE_STALE_MINUTES = 2;
    private static final long CONFERENCE_AUTO_END_EMPTY_MINUTES = 10;
    private static final long CONFERENCE_SCHEDULE_LOCK_ID = 7_102_001L;
    private static final long CONFERENCE_RECORDING_IMPORT_LOCK_ID = 7_102_002L;
    private static final int MAX_CONFERENCE_TITLE_LENGTH = 120;
    private static final String GROUP_CONFERENCE_TITLE_PREFIX = "Созвон ";

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatRoomBanRepository chatRoomBanRepository;
    private final UserAccountRepository userAccountRepository;
    private final VideoConferenceRepository videoConferenceRepository;
    private final VideoConferenceParticipantRepository videoConferenceParticipantRepository;
    private final VideoConferenceAttendanceRepository videoConferenceAttendanceRepository;
    private final ConferenceRecordingRepository conferenceRecordingRepository;
    private final ConferenceRecordingStorage conferenceRecordingStorage;
    private final ConferenceRecordingImportService conferenceRecordingImportService;
    private final ClusterJobLockService clusterJobLockService;
    private final byte[] conferenceAccessSecret;

    public VideoConferenceService(
            AuthService authService,
            ChatService chatService,
            ChatParticipantRepository chatParticipantRepository,
            ChatRoomBanRepository chatRoomBanRepository,
            UserAccountRepository userAccountRepository,
            VideoConferenceRepository videoConferenceRepository,
            VideoConferenceParticipantRepository videoConferenceParticipantRepository,
            VideoConferenceAttendanceRepository videoConferenceAttendanceRepository,
            ConferenceRecordingRepository conferenceRecordingRepository,
            ConferenceRecordingStorage conferenceRecordingStorage,
            ConferenceRecordingImportService conferenceRecordingImportService,
            ClusterJobLockService clusterJobLockService,
            JwtProperties jwtProperties
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatRoomBanRepository = chatRoomBanRepository;
        this.userAccountRepository = userAccountRepository;
        this.videoConferenceRepository = videoConferenceRepository;
        this.videoConferenceParticipantRepository = videoConferenceParticipantRepository;
        this.videoConferenceAttendanceRepository = videoConferenceAttendanceRepository;
        this.conferenceRecordingRepository = conferenceRecordingRepository;
        this.conferenceRecordingStorage = conferenceRecordingStorage;
        this.conferenceRecordingImportService = conferenceRecordingImportService;
        this.clusterJobLockService = clusterJobLockService;
        this.conferenceAccessSecret = resolveConferenceAccessSecret(jwtProperties);
    }

    public List<VideoConferenceResponse> listConferences(String username) {
        return listConferences(username, false);
    }

    public List<VideoConferenceResponse> listArchivedConferences(String username) {
        return listConferences(username, true);
    }

    private List<VideoConferenceResponse> listConferences(String username, boolean archived) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        List<VideoConferenceParticipant> explicitMemberships =
                videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(currentUser.getId());
        List<ChatParticipant> chatMemberships =
                chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(currentUser.getId());
        LinkedHashSet<UUID> directConferenceIds = explicitMemberships.stream()
                .map(VideoConferenceParticipant::getConferenceId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        LinkedHashSet<UUID> visibleChatIds = chatMemberships.stream()
                .map(ChatParticipant::getChatId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<VideoConference> chatBoundConferences = visibleChatIds.isEmpty()
                ? List.of()
                : videoConferenceRepository.findAllByChatIdIn(visibleChatIds);
        if (directConferenceIds.isEmpty() && chatBoundConferences.isEmpty()) {
            return List.of();
        }

        Map<UUID, VideoConference> conferencesById = new LinkedHashMap<>();
        if (!directConferenceIds.isEmpty()) {
            videoConferenceRepository.findAllByIdIn(directConferenceIds)
                    .forEach(conference -> conferencesById.put(conference.getId(), conference));
        }
        chatBoundConferences.forEach(conference -> conferencesById.put(conference.getId(), conference));
        if (conferencesById.isEmpty()) {
            return List.of();
        }

        List<UUID> conferenceIds = List.copyOf(conferencesById.keySet());
        Map<UUID, List<VideoConferenceParticipant>> participantsByConferenceId =
                videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(conferenceIds).stream()
                        .collect(Collectors.groupingBy(
                                VideoConferenceParticipant::getConferenceId,
                                LinkedHashMap::new,
                                Collectors.toList()
                        ));
        LinkedHashSet<UUID> conferenceChatIds = conferencesById.values().stream()
                .map(VideoConference::getChatId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        // Only active memberships (left_at IS NULL) define a chat-bound conference's participants.
        // Banning a member calls ChatParticipant.leave(...), so this also keeps banned users out of
        // the conference participant list, matching buildConferenceResponse(...).
        Map<UUID, List<ChatParticipant>> participantsByChatId = conferenceChatIds.isEmpty()
                ? Map.of()
                : chatParticipantRepository.findAllByChatIdInAndLeftAtIsNullOrderByJoinedAtAsc(conferenceChatIds).stream()
                        .collect(Collectors.groupingBy(
                                ChatParticipant::getChatId,
                                LinkedHashMap::new,
                                Collectors.toList()
                        ));
        Map<UUID, UserAccount> usersById = findUsersById(
                collectVisibleUserIds(conferencesById.values(), participantsByConferenceId, participantsByChatId)
        );
        Map<UUID, ConferenceRecording> recordingsByConferenceId =
                conferenceRecordingRepository.findAllByConferenceIdIn(conferenceIds).stream()
                        .collect(Collectors.toMap(ConferenceRecording::getConferenceId, Function.identity()));

        return conferencesById.values().stream()
                .filter(conference -> archived ? conference.isEnded() : !conference.isEnded())
                .map(conference -> toResponse(
                        conference,
                        participantsByConferenceId.getOrDefault(conference.getId(), List.of()),
                        conference.getChatId() == null
                                ? List.of()
                                : participantsByChatId.getOrDefault(conference.getChatId(), List.of()),
                        usersById,
                        currentUser.getId(),
                        recordingsByConferenceId.get(conference.getId())
                ))
                .sorted(archived ? archivedConferenceComparator() : activeConferenceComparator())
                .toList();
    }

    @Transactional
    public VideoConferenceResponse createConference(String username, CreateVideoConferenceRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        Instant now = Instant.now();
        if (request.scheduledAt().isBefore(now.minusSeconds(60))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conference must be scheduled in the present or future");
        }

        UUID targetChatId = request.chatId();
        List<UserAccount> conferenceParticipants;
        if (targetChatId != null) {
            ChatRoom room = chatService.requireChatMembership(targetChatId, currentUser);
            if (room.isDirect()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chats cannot host group conference calls");
            }
            chatService.assertChatInteractionAllowed(room, currentUser);
            conferenceParticipants = resolveGroupConferenceParticipants(targetChatId);
        } else {
            LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                    request.participantUsernames(),
                    currentUser.getUsername()
            );
            List<UserAccount> invitedUsers = normalizedUsernames.stream()
                    .map(authService::requireExistingUser)
                    .toList();
            conferenceParticipants = buildConferenceParticipants(currentUser, invitedUsers);
        }

        UUID conferenceId = UUID.randomUUID();
        boolean activateImmediately = shouldActivateConference(request.scheduledAt(), now);
        boolean startImmediately = shouldStartConference(request.scheduledAt(), now);
        VideoConference conference = new VideoConference(
                conferenceId,
                normalizeConferenceTitle(request.title()),
                activateImmediately ? createRoomName(conferenceId) : null,
                currentUser.getId(),
                request.scheduledAt(),
                now,
                activateImmediately ? now : null,
                activateImmediately && startImmediately ? now : null,
                targetChatId
        );
        videoConferenceRepository.save(conference);
        persistParticipants(conferenceId, conferenceParticipants, now);
        return buildConferenceResponse(conference, currentUser.getId());
    }

    @Transactional
    public VideoConferenceResponse startGroupConferenceCall(String username, UUID chatId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        if (room.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct chats cannot host group conference calls");
        }

        Instant now = Instant.now();
        VideoConference reusableConference = selectReusableGroupConference(chatId, now);
        if (reusableConference != null) {
            if (!reusableConference.isStarted()) {
                if (reusableConference.getRoomName() == null) {
                    reusableConference.activate(createRoomName(reusableConference.getId()), now);
                }
                reusableConference.start(now);
            }
            return buildConferenceResponse(reusableConference, currentUser.getId());
        }

        return createConference(
                username,
                new CreateVideoConferenceRequest(
                        buildGroupConferenceTitle(room.getTitle()),
                        now,
                        List.of(),
                        chatId
                )
        );
    }

    @Transactional
    public VideoConferenceResponse updateConference(String username, UUID conferenceId, UpdateVideoConferenceRequest request) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));

        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can update the conference");
        }
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }
        if (conference.isStarted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Started conference can no longer be changed");
        }

        Instant now = Instant.now();
        if (request.scheduledAt().isBefore(now.minusSeconds(60))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conference must be scheduled in the present or future");
        }

        conference.updateDetails(request.title().trim(), request.scheduledAt());
        if (shouldStartConference(request.scheduledAt(), now)) {
            conference.activate(createRoomName(conference.getId()), now);
            conference.start(now);
        } else if (shouldActivateConference(request.scheduledAt(), now)) {
            conference.activate(createRoomName(conference.getId()), now);
        } else {
            conference.clearActivation();
        }

        return buildConferenceResponse(conference, currentUser.getId());
    }

    @Transactional
    public VideoConferenceResponse startConference(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));

        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can start the conference");
        }
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }

        Instant now = Instant.now();
        if (conference.getRoomName() == null) {
            if (!shouldActivateConference(conference.getScheduledAt(), now)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Conference room will open 5 minutes before the scheduled start"
                );
            }
            conference.activate(createRoomName(conference.getId()), now);
        }
        conference.start(now);

        return buildConferenceResponse(conference, currentUser.getId());
    }

    @Transactional
    public VideoConferenceResponse addParticipants(
            String username,
            UUID conferenceId,
            AddConferenceParticipantsRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can invite participants");
        }
        if (conference.getChatId() != null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Group conference participants are managed by current chat membership"
            );
        }
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot add participants to an ended conference");
        }

        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
        Map<UUID, UserAccount> existingUsersById = findUsersById(
                memberships.stream()
                        .map(VideoConferenceParticipant::getUserId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        );

        LinkedHashSet<String> existingUsernames = existingUsersById.values().stream()
                .map(UserAccount::getUsername)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                request.participantUsernames(),
                currentUser.getUsername(),
                existingUsernames
        );

        if (!normalizedUsernames.isEmpty()) {
            List<UserAccount> invitedUsers = normalizedUsernames.stream()
                    .map(authService::requireExistingUser)
                    .toList();
            persistParticipants(conferenceId, invitedUsers, Instant.now());
            memberships = videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
            existingUsersById = findUsersById(
                    memberships.stream()
                            .map(VideoConferenceParticipant::getUserId)
                            .collect(Collectors.toCollection(LinkedHashSet::new))
            );
        }

        existingUsersById.putIfAbsent(currentUser.getId(), currentUser);
        return buildConferenceResponse(conference, currentUser.getId());
    }

    @Transactional
    public VideoConferenceResponse joinConferenceViaInvite(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }

        if (conference.getChatId() != null) {
            chatService.requireChatMembership(conference.getChatId(), currentUser);
            return buildConferenceResponse(conference, currentUser.getId());
        }

        if (!videoConferenceParticipantRepository.existsByConferenceIdAndUserId(conferenceId, currentUser.getId())) {
            videoConferenceParticipantRepository.save(
                    new VideoConferenceParticipant(UUID.randomUUID(), conferenceId, currentUser.getId(), Instant.now())
            );
        }

        return buildConferenceResponse(conference, currentUser.getId());
    }

    @Transactional
    public void touchConferencePresence(String username, UUID sessionId, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }
        if (!conference.isJoinAvailable()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference room is not available yet");
        }
        if (!hasConferenceAccess(conference, currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conference is not available");
        }

        Instant now = Instant.now();
        VideoConferenceAttendance attendance = videoConferenceAttendanceRepository
                .findByConferenceIdAndSessionId(conferenceId, sessionId)
                .orElseGet(() -> new VideoConferenceAttendance(
                        UUID.randomUUID(),
                        conferenceId,
                        currentUser.getId(),
                        sessionId,
                        now,
                        now,
                        null
                ));
        if (!attendance.getUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conference is not available");
        }
        attendance.touch(now);
        videoConferenceAttendanceRepository.save(attendance);
    }

    @Transactional
    public void clearConferencePresence(String username, UUID sessionId, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        videoConferenceAttendanceRepository.findByConferenceIdAndSessionId(conferenceId, sessionId)
                .filter(attendance -> attendance.getUserId().equals(currentUser.getId()))
                .ifPresent(attendance -> attendance.leave(Instant.now()));
    }

    @Transactional
    public VideoConferenceResponse endConference(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));

        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can end the conference");
        }

        conference.end(Instant.now());
        return buildConferenceResponse(conference, currentUser.getId());
    }

    public VideoConference requireConferenceInviteLinkAccess(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (conference.getChatId() != null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Group conference invite links are not available"
            );
        }
        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can create invite links");
        }
        return conference;
    }

    @Transactional
    public void cancelConference(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));

        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can cancel the conference");
        }
        if (conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference has already ended");
        }
        if (conference.isStarted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Started conference can no longer be cancelled");
        }

        videoConferenceRepository.delete(conference);
    }

    @Transactional
    public VideoConferenceResponse uploadRecording(String username, UUID conferenceId, MultipartFile file) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));

        if (!conference.getCreatedByUserId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the organizer can upload the recording");
        }
        if (!conference.isEnded()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conference must be ended before uploading recording");
        }

        ConferenceRecording existingRecording = findRecording(conferenceId);
        String previousStoredFilename = existingRecording != null ? existingRecording.getStoredFilename() : null;
        String mimeType = normalizeRecordingMimeType(file.getContentType());
        ConferenceRecordingStorage.StoredConferenceRecordingFile storedFile = conferenceRecordingStorage.store(
                conferenceId,
                file
        );
        Instant now = Instant.now();
        ConferenceRecording recording = existingRecording == null
                ? new ConferenceRecording(
                        conferenceId,
                        storedFile.storedFilename(),
                        mimeType,
                        file.getSize(),
                        now,
                        currentUser.getId()
                )
                : existingRecording;

        if (existingRecording != null) {
            recording.replaceStoredFile(storedFile.storedFilename(), mimeType, file.getSize(), now);
        }
        conferenceRecordingRepository.save(recording);
        registerAfterTransaction(
                () -> {
                    if (previousStoredFilename != null && !previousStoredFilename.equals(storedFile.storedFilename())) {
                        conferenceRecordingStorage.deleteQuietly(previousStoredFilename);
                    }
                },
                () -> {
                    if (previousStoredFilename == null || !previousStoredFilename.equals(storedFile.storedFilename())) {
                        conferenceRecordingStorage.deleteQuietly(storedFile.storedFilename());
                    }
                }
        );

        return buildConferenceResponse(conference, currentUser.getId());
    }

    public String generateJitsiToken(String username, UUID conferenceId, JitsiJwtService jitsiJwtService) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (!hasConferenceAccess(conference, currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conference is not available");
        }
        boolean moderator = conference.getCreatedByUserId().equals(currentUser.getId());
        return jitsiJwtService.generateToken(
                currentUser.getId(),
                currentUser.getDisplayName(),
                currentUser.getEmail(),
                conference.getRoomName(),
                moderator
        );
    }

    public ConferenceRecordingDownload downloadRecording(String username, UUID conferenceId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (!hasConferenceAccess(conference, currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conference recording is not available");
        }

        ConferenceRecording recording = conferenceRecordingRepository.findByConferenceId(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference recording not found"));
        Resource resource = conferenceRecordingStorage.loadAsResource(recording.getStoredFilename());
        return new ConferenceRecordingDownload(
                conference,
                recording,
                resource,
                buildRecordingFileName(conference, recording)
        );
    }

    @Scheduled(fixedDelay = 30_000L)
    @Transactional
    public void activateScheduledConferences() {
        clusterJobLockService.runIfLockAcquired(CONFERENCE_SCHEDULE_LOCK_ID, () -> {
            Instant now = Instant.now();
            activateDueConferences(now);
            startDueConferences(now);
            endInactiveStartedConferences(now);
        });
    }

    @Scheduled(fixedDelay = 15_000L)
    @Transactional
    public void importFinishedConferenceRecordings() {
        clusterJobLockService.runIfLockAcquired(
                CONFERENCE_RECORDING_IMPORT_LOCK_ID,
                this::synchronizeImportedRecordings
        );
    }

    private VideoConferenceResponse toResponse(
            VideoConference conference,
            List<VideoConferenceParticipant> memberships,
            List<ChatParticipant> chatMemberships,
            Map<UUID, UserAccount> usersById,
            UUID currentUserId,
            ConferenceRecording recording
    ) {
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(usersById.keySet());
        List<ParticipantResponse> participants = resolveVisibleConferenceUserIds(conference, memberships, chatMemberships).stream()
                .map(usersById::get)
                .filter(Objects::nonNull)
                .map(user -> authService.toParticipant(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();
        List<UUID> activeParticipantUserIds = findActiveParticipantUserIds(conference.getId());

        UserAccount creator = usersById.get(conference.getCreatedByUserId());
        if (creator == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Conference creator is missing");
        }

        return new VideoConferenceResponse(
                conference.getId(),
                conference.getTitle(),
                visibleRoomName(conference, currentUserId),
                visibleRoomAccessCode(conference, currentUserId),
                conference.getScheduledAt(),
                conference.getCreatedAt(),
                conference.getActivatedAt(),
                conference.getStartedAt(),
                conference.getEndedAt(),
                recording != null ? recording.getCreatedAt() : null,
                recording != null ? recording.getSizeBytes() : null,
                recording != null ? recording.getMimeType() : null,
                authService.toParticipant(creator, onlineByUserId.getOrDefault(creator.getId(), false)),
                participants,
                conference.getChatId(),
                activeParticipantUserIds.size(),
                activeParticipantUserIds
        );
    }

    private Comparator<VideoConferenceResponse> activeConferenceComparator() {
        return Comparator
                .comparing(VideoConferenceResponse::scheduledAt)
                .thenComparing(VideoConferenceResponse::createdAt);
    }

    private Comparator<VideoConferenceResponse> archivedConferenceComparator() {
        return Comparator
                .comparing(
                        VideoConferenceResponse::endedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())
                )
                .thenComparing(VideoConferenceResponse::scheduledAt, Comparator.reverseOrder())
                .thenComparing(VideoConferenceResponse::createdAt, Comparator.reverseOrder());
    }

    private void persistParticipants(UUID conferenceId, List<UserAccount> participants, Instant invitedAt) {
        LinkedHashSet<UUID> seenUserIds = new LinkedHashSet<>();
        participants.stream()
                .map(UserAccount::getId)
                .filter(seenUserIds::add)
                .forEach(userId -> videoConferenceParticipantRepository.save(
                        new VideoConferenceParticipant(UUID.randomUUID(), conferenceId, userId, invitedAt)
                ));
    }

    private LinkedHashSet<String> normalizeParticipantUsernames(
            List<String> participantUsernames,
            String currentUsername
    ) {
        return normalizeParticipantUsernames(participantUsernames, currentUsername, List.of());
    }

    private LinkedHashSet<String> normalizeParticipantUsernames(
            List<String> participantUsernames,
            String currentUsername,
            Collection<String> excludedUsernames
    ) {
        LinkedHashSet<String> excluded = excludedUsernames.stream()
                .map(this::normalizeUsername)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        return participantUsernames.stream()
                .map(this::normalizeUsername)
                .filter(candidate -> !candidate.equals(currentUsername))
                .filter(candidate -> !excluded.contains(candidate))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Map<UUID, UserAccount> findUsersById(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }

        return userAccountRepository.findAllByIdIn(ids).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
    }

    private VideoConferenceResponse buildConferenceResponse(VideoConference conference, UUID currentUserId) {
        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conference.getId());
        List<ChatParticipant> chatMemberships = conference.getChatId() == null
                ? List.of()
                : chatParticipantRepository.findAllByChatIdAndLeftAtIsNullOrderByJoinedAtAsc(conference.getChatId());
        Map<UUID, List<ChatParticipant>> membershipsByChatId = conference.getChatId() == null
                ? Map.of()
                : Map.of(conference.getChatId(), chatMemberships);
        Map<UUID, UserAccount> usersById = findUsersById(
                collectVisibleUserIds(List.of(conference), Map.of(conference.getId(), memberships), membershipsByChatId)
        );
        return toResponse(conference, memberships, chatMemberships, usersById, currentUserId, findRecording(conference.getId()));
    }

    private List<UserAccount> resolveGroupConferenceParticipants(UUID chatId) {
        List<ChatParticipant> chatMemberships = chatParticipantRepository.findAllByChatIdAndLeftAtIsNullOrderByJoinedAtAsc(chatId);
        Set<UUID> bannedUserIds = chatRoomBanRepository.findAllByChatId(chatId).stream()
                .map(ban -> ban.getUserId())
                .collect(Collectors.toSet());
        Map<UUID, UserAccount> usersById = findUsersById(
                chatMemberships.stream()
                        .map(ChatParticipant::getUserId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        );
        return chatMemberships.stream()
                .map(ChatParticipant::getUserId)
                .filter(userId -> !bannedUserIds.contains(userId))
                .map(usersById::get)
                .filter(Objects::nonNull)
                .toList();
    }

    private List<UserAccount> buildConferenceParticipants(UserAccount currentUser, List<UserAccount> invitedUsers) {
        LinkedHashMap<UUID, UserAccount> participantsById = new LinkedHashMap<>();
        participantsById.put(currentUser.getId(), currentUser);
        invitedUsers.forEach(user -> participantsById.putIfAbsent(user.getId(), user));
        return List.copyOf(participantsById.values());
    }

    private LinkedHashSet<UUID> collectVisibleUserIds(
            Collection<VideoConference> conferences,
            Map<UUID, List<VideoConferenceParticipant>> membershipsByConferenceId,
            Map<UUID, List<ChatParticipant>> membershipsByChatId
    ) {
        LinkedHashSet<UUID> userIds = new LinkedHashSet<>();
        conferences.forEach(conference -> {
            userIds.add(conference.getCreatedByUserId());
            resolveVisibleConferenceUserIds(
                    conference,
                    membershipsByConferenceId.getOrDefault(conference.getId(), List.of()),
                    conference.getChatId() == null
                            ? List.of()
                            : membershipsByChatId.getOrDefault(conference.getChatId(), List.of())
            ).forEach(userIds::add);
        });
        return userIds;
    }

    private List<UUID> resolveVisibleConferenceUserIds(
            VideoConference conference,
            List<VideoConferenceParticipant> memberships,
            List<ChatParticipant> chatMemberships
    ) {
        if (conference.getChatId() == null) {
            return memberships.stream()
                    .map(VideoConferenceParticipant::getUserId)
                    .distinct()
                    .toList();
        }

        return chatMemberships.stream()
                .map(ChatParticipant::getUserId)
                .distinct()
                .toList();
    }

    private List<UUID> findActiveParticipantUserIds(UUID conferenceId) {
        Instant activeAfter = Instant.now().minus(CONFERENCE_PRESENCE_STALE_MINUTES, ChronoUnit.MINUTES);
        return videoConferenceAttendanceRepository.findActiveUserIds(conferenceId, activeAfter);
    }

    private boolean hasConferenceAccess(VideoConference conference, UserAccount currentUser) {
        if (conference.getChatId() != null) {
            return chatParticipantRepository.existsByChatIdAndUserIdAndLeftAtIsNull(
                    conference.getChatId(),
                    currentUser.getId()
            );
        }

        return videoConferenceParticipantRepository.existsByConferenceIdAndUserId(conference.getId(), currentUser.getId());
    }

    private VideoConference selectReusableGroupConference(UUID chatId, Instant now) {
        List<VideoConference> groupConferences =
                videoConferenceRepository.findAllByChatIdAndEndedAtIsNullOrderByScheduledAtAscCreatedAtAsc(chatId);

        return groupConferences.stream()
                .filter(VideoConference::isStarted)
                .findFirst()
                .orElseGet(() -> groupConferences.stream()
                        .filter(conference -> conference.isJoinAvailable() || shouldActivateConference(conference.getScheduledAt(), now))
                        .findFirst()
                        .orElse(null));
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String buildGroupConferenceTitle(String roomTitle) {
        String normalizedRoomTitle = roomTitle == null ? "" : roomTitle.trim();
        return normalizeConferenceTitle(GROUP_CONFERENCE_TITLE_PREFIX + normalizedRoomTitle);
    }

    private String normalizeConferenceTitle(String title) {
        String normalizedTitle = title == null ? "" : title.trim();
        if (normalizedTitle.length() <= MAX_CONFERENCE_TITLE_LENGTH) {
            return normalizedTitle;
        }
        return normalizedTitle.substring(0, MAX_CONFERENCE_TITLE_LENGTH).trim();
    }

    @Transactional
    protected void activateDueConferences(Instant now) {
        Instant activationThreshold = now.plus(ROOM_ACTIVATION_LEAD_MINUTES, ChronoUnit.MINUTES);
        List<VideoConference> conferencesToActivate =
                videoConferenceRepository.findAllByEndedAtIsNullAndRoomNameIsNullAndScheduledAtLessThanEqual(activationThreshold);
        if (conferencesToActivate.isEmpty()) {
            return;
        }

        conferencesToActivate.forEach(conference -> conference.activate(createRoomName(conference.getId()), now));
        videoConferenceRepository.saveAll(conferencesToActivate);
    }

    @Transactional
    protected void startDueConferences(Instant now) {
        List<VideoConference> conferencesToStart =
                videoConferenceRepository.findAllByEndedAtIsNullAndStartedAtIsNullAndScheduledAtLessThanEqual(now);
        if (conferencesToStart.isEmpty()) {
            return;
        }

        conferencesToStart.forEach(conference -> {
            if (conference.getRoomName() == null) {
                conference.activate(createRoomName(conference.getId()), now);
            }
            conference.start(now);
        });
        videoConferenceRepository.saveAll(conferencesToStart);
    }

    @Transactional
    protected void endInactiveStartedConferences(Instant now) {
        List<VideoConference> startedConferences = videoConferenceRepository.findAllByEndedAtIsNullAndStartedAtIsNotNull();
        if (startedConferences.isEmpty()) {
            return;
        }

        Instant activeAfter = now.minus(CONFERENCE_PRESENCE_STALE_MINUTES, ChronoUnit.MINUTES);
        Instant emptySinceThreshold = now.minus(CONFERENCE_AUTO_END_EMPTY_MINUTES, ChronoUnit.MINUTES);
        List<VideoConference> conferencesToEnd = startedConferences.stream()
                .filter(conference -> videoConferenceAttendanceRepository.countActiveSessions(
                        conference.getId(),
                        activeAfter
                ) == 0L)
                .filter(conference -> {
                    Instant lastSeenAt = videoConferenceAttendanceRepository.findLatestSeenAt(conference.getId());
                    Instant emptySince = lastSeenAt != null ? lastSeenAt : conference.getStartedAt();
                    return emptySince != null && !emptySince.isAfter(emptySinceThreshold);
                })
                .peek(conference -> conference.end(now))
                .toList();
        if (!conferencesToEnd.isEmpty()) {
            videoConferenceRepository.saveAll(conferencesToEnd);
        }
    }

    @Transactional
    protected void synchronizeImportedRecordings() {
        List<ConferenceRecordingImportService.ImportedConferenceRecordingCandidate> importedRecordings =
                conferenceRecordingImportService.discoverAvailableRecordings();
        if (importedRecordings.isEmpty()) {
            return;
        }

        LinkedHashSet<UUID> conferenceIds = importedRecordings.stream()
                .map(ConferenceRecordingImportService.ImportedConferenceRecordingCandidate::conferenceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        LinkedHashSet<String> roomNames = importedRecordings.stream()
                .map(ConferenceRecordingImportService.ImportedConferenceRecordingCandidate::roomName)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        Map<UUID, VideoConference> conferencesById = conferenceIds.isEmpty()
                ? Map.of()
                : videoConferenceRepository.findAllByIdIn(conferenceIds).stream()
                        .collect(Collectors.toMap(VideoConference::getId, Function.identity()));
        Map<String, VideoConference> conferencesByRoomName = roomNames.isEmpty()
                ? Map.of()
                : videoConferenceRepository.findAllByEndedAtIsNotNullAndRoomNameIn(roomNames).stream()
                        .collect(Collectors.toMap(VideoConference::getRoomName, Function.identity()));

        LinkedHashSet<UUID> candidateConferenceIds = new LinkedHashSet<>();
        candidateConferenceIds.addAll(conferencesById.keySet());
        conferencesByRoomName.values().stream()
                .map(VideoConference::getId)
                .forEach(candidateConferenceIds::add);

        Map<UUID, ConferenceRecording> recordingsByConferenceId = candidateConferenceIds.isEmpty()
                ? Map.of()
                : conferenceRecordingRepository.findAllByConferenceIdIn(candidateConferenceIds).stream()
                        .collect(Collectors.toMap(ConferenceRecording::getConferenceId, Function.identity()));

        for (ConferenceRecordingImportService.ImportedConferenceRecordingCandidate importedRecording : importedRecordings) {
            VideoConference conference = resolveImportedRecordingConference(
                    importedRecording,
                    conferencesById,
                    conferencesByRoomName
            );
            if (conference == null || !conference.isEnded()) {
                continue;
            }

            if (recordingsByConferenceId.containsKey(conference.getId())) {
                registerAfterTransaction(
                        () -> conferenceRecordingImportService.deleteImportedRecordingQuietly(importedRecording.sourceDirectory()),
                        null
                );
                continue;
            }

            ConferenceRecordingStorage.StoredConferenceRecordingFile storedFile =
                    conferenceRecordingStorage.importStoredFile(
                            conference.getId(),
                            importedRecording.videoFile(),
                            importedRecording.mimeType()
                    );
            ConferenceRecording recording = new ConferenceRecording(
                    conference.getId(),
                    storedFile.storedFilename(),
                    normalizeRecordingMimeType(importedRecording.mimeType()),
                    importedRecording.sizeBytes(),
                    importedRecording.completedAt(),
                    conference.getCreatedByUserId()
            );
            conferenceRecordingRepository.save(recording);
            recordingsByConferenceId.put(conference.getId(), recording);
            registerAfterTransaction(
                    () -> conferenceRecordingImportService.deleteImportedRecordingQuietly(importedRecording.sourceDirectory()),
                    () -> conferenceRecordingStorage.deleteQuietly(storedFile.storedFilename())
            );
        }
    }

    private boolean shouldActivateConference(Instant scheduledAt, Instant now) {
        return !scheduledAt.isAfter(now.plus(ROOM_ACTIVATION_LEAD_MINUTES, ChronoUnit.MINUTES));
    }

    private boolean shouldStartConference(Instant scheduledAt, Instant now) {
        return !scheduledAt.isAfter(now);
    }

    private VideoConference resolveImportedRecordingConference(
            ConferenceRecordingImportService.ImportedConferenceRecordingCandidate importedRecording,
            Map<UUID, VideoConference> conferencesById,
            Map<String, VideoConference> conferencesByRoomName
    ) {
        if (importedRecording.conferenceId() != null) {
            VideoConference conference = conferencesById.get(importedRecording.conferenceId());
            if (conference != null) {
                return conference;
            }
        }

        if (importedRecording.roomName() == null) {
            return null;
        }
        return conferencesByRoomName.get(importedRecording.roomName());
    }

    private ConferenceRecording findRecording(UUID conferenceId) {
        return conferenceRecordingRepository.findByConferenceId(conferenceId).orElse(null);
    }

    private String visibleRoomName(VideoConference conference, UUID currentUserId) {
        if (conference.getRoomName() == null) {
            return null;
        }
        if (conference.isEnded()) {
            return conference.getRoomName();
        }
        if (conference.getCreatedByUserId().equals(currentUserId) || conference.getActivatedAt() != null) {
            return conference.getRoomName();
        }
        return null;
    }

    private String visibleRoomAccessCode(VideoConference conference, UUID currentUserId) {
        if (conference.isEnded()) {
            return null;
        }

        String visibleRoomName = visibleRoomName(conference, currentUserId);
        if (visibleRoomName == null) {
            return null;
        }

        return buildRoomAccessCode(conference);
    }

    private String createRoomName(UUID conferenceId) {
        byte[] roomBytes = ByteBuffer.allocate(Long.BYTES * 2)
                .putLong(UUID.randomUUID().getMostSignificantBits())
                .putLong(UUID.randomUUID().getLeastSignificantBits())
                .array();
        return "vc-" + Base64.getUrlEncoder().withoutPadding().encodeToString(roomBytes).toLowerCase(Locale.ROOT);
    }

    private byte[] resolveConferenceAccessSecret(JwtProperties jwtProperties) {
        String configuredSecret = jwtProperties.secret();
        if (configuredSecret != null && !configuredSecret.isBlank()) {
            return Base64.getDecoder().decode(configuredSecret);
        }

        return "north-messenger-conference-access-fallback".getBytes(StandardCharsets.UTF_8);
    }

    private String buildRoomAccessCode(VideoConference conference) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(conferenceAccessSecret, "HmacSHA256"));
            mac.update(conference.getId().toString().getBytes(StandardCharsets.UTF_8));
            mac.update((byte) ':');
            mac.update(conference.getRoomName().getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(Arrays.copyOf(mac.doFinal(), 18));
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to build conference access code",
                    exception
            );
        }
    }

    private String normalizeRecordingMimeType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return "video/webm";
        }
        if (!mimeType.toLowerCase(Locale.ROOT).startsWith("video/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conference recording must be a video file");
        }
        return mimeType;
    }

    private String buildRecordingFileName(VideoConference conference, ConferenceRecording recording) {
        String normalizedMimeType = recording.getMimeType().toLowerCase(Locale.ROOT);
        String extension;
        if (normalizedMimeType.contains("mp4")) {
            extension = ".mp4";
        } else if (normalizedMimeType.contains("matroska") || normalizedMimeType.contains("mkv")) {
            extension = ".mkv";
        } else {
            extension = ".webm";
        }
        String sanitizedTitle = conference.getTitle()
                .replaceAll("[\\\\/:*?\"<>|]+", "-")
                .trim();
        if (sanitizedTitle.isBlank()) {
            sanitizedTitle = "conference-recording";
        }
        return sanitizedTitle + "-" + conference.getId() + extension;
    }

    private void registerAfterTransaction(Runnable afterCommitAction, Runnable rollbackAction) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            if (afterCommitAction != null) {
                afterCommitAction.run();
            }
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                if (afterCommitAction != null) {
                    afterCommitAction.run();
                }
            }

            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED && rollbackAction != null) {
                    rollbackAction.run();
                }
            }
        });
    }

    public record ConferenceRecordingDownload(
            VideoConference conference,
            ConferenceRecording recording,
            Resource resource,
            String downloadFileName
    ) {
    }
}
