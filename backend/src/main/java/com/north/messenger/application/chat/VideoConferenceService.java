package com.north.messenger.application.chat;

import com.north.messenger.api.dto.AddConferenceParticipantsRequest;
import com.north.messenger.api.dto.CreateVideoConferenceRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ConferenceRecording;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.VideoConference;
import com.north.messenger.domain.model.VideoConferenceParticipant;
import com.north.messenger.domain.repository.ConferenceRecordingRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class VideoConferenceService {

    private static final long ROOM_ACTIVATION_LEAD_MINUTES = 5;

    private final AuthService authService;
    private final UserAccountRepository userAccountRepository;
    private final VideoConferenceRepository videoConferenceRepository;
    private final VideoConferenceParticipantRepository videoConferenceParticipantRepository;
    private final ConferenceRecordingRepository conferenceRecordingRepository;
    private final ConferenceRecordingStorage conferenceRecordingStorage;
    private final ConferenceRecordingImportService conferenceRecordingImportService;
    private final byte[] conferenceAccessSecret;

    public VideoConferenceService(
            AuthService authService,
            UserAccountRepository userAccountRepository,
            VideoConferenceRepository videoConferenceRepository,
            VideoConferenceParticipantRepository videoConferenceParticipantRepository,
            ConferenceRecordingRepository conferenceRecordingRepository,
            ConferenceRecordingStorage conferenceRecordingStorage,
            ConferenceRecordingImportService conferenceRecordingImportService,
            JwtProperties jwtProperties
    ) {
        this.authService = authService;
        this.userAccountRepository = userAccountRepository;
        this.videoConferenceRepository = videoConferenceRepository;
        this.videoConferenceParticipantRepository = videoConferenceParticipantRepository;
        this.conferenceRecordingRepository = conferenceRecordingRepository;
        this.conferenceRecordingStorage = conferenceRecordingStorage;
        this.conferenceRecordingImportService = conferenceRecordingImportService;
        this.conferenceAccessSecret = resolveConferenceAccessSecret(jwtProperties);
    }

    public List<VideoConferenceResponse> listConferences(String username) {
        return listConferences(username, false);
    }

    public List<VideoConferenceResponse> listArchivedConferences(String username) {
        return listConferences(username, true);
    }

    private List<VideoConferenceResponse> listConferences(String username, boolean archived) {
        synchronizeImportedRecordings();
        if (!archived) {
            Instant now = Instant.now();
            activateDueConferences(now);
            startDueConferences(now);
        }

        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByUserIdOrderByInvitedAtDesc(currentUser.getId());
        if (memberships.isEmpty()) {
            return List.of();
        }

        List<UUID> conferenceIds = memberships.stream()
                .map(VideoConferenceParticipant::getConferenceId)
                .distinct()
                .toList();
        Map<UUID, VideoConference> conferencesById = videoConferenceRepository.findAllByIdIn(conferenceIds).stream()
                .collect(Collectors.toMap(VideoConference::getId, Function.identity()));
        Map<UUID, List<VideoConferenceParticipant>> participantsByConferenceId =
                videoConferenceParticipantRepository.findAllByConferenceIdInOrderByInvitedAtAsc(conferenceIds).stream()
                        .collect(Collectors.groupingBy(
                                VideoConferenceParticipant::getConferenceId,
                                Collectors.toList()
                        ));
        Map<UUID, UserAccount> usersById = findUsersById(
                participantsByConferenceId.values().stream()
                        .flatMap(List::stream)
                        .map(VideoConferenceParticipant::getUserId)
                        .collect(Collectors.toSet())
        );
        Map<UUID, ConferenceRecording> recordingsByConferenceId =
                conferenceRecordingRepository.findAllByConferenceIdIn(conferenceIds).stream()
                        .collect(Collectors.toMap(ConferenceRecording::getConferenceId, Function.identity()));

        return conferenceIds.stream()
                .map(conferencesById::get)
                .filter(Objects::nonNull)
                .filter(conference -> archived ? conference.isEnded() : !conference.isEnded())
                .map(conference -> toResponse(
                        conference,
                        participantsByConferenceId.getOrDefault(conference.getId(), List.of()),
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

        LinkedHashSet<String> normalizedUsernames = normalizeParticipantUsernames(
                request.participantUsernames(),
                currentUser.getUsername()
        );
        List<UserAccount> invitedUsers = normalizedUsernames.stream()
                .map(authService::requireExistingUser)
                .toList();

        UUID conferenceId = UUID.randomUUID();
        boolean activateImmediately = shouldActivateConference(request.scheduledAt(), now);
        boolean startImmediately = shouldStartConference(request.scheduledAt(), now);
        VideoConference conference = new VideoConference(
                conferenceId,
                request.title().trim(),
                activateImmediately ? createRoomName(conferenceId) : null,
                currentUser.getId(),
                request.scheduledAt(),
                now,
                activateImmediately ? now : null,
                activateImmediately && startImmediately ? now : null
        );
        videoConferenceRepository.save(conference);
        persistParticipants(conferenceId, currentUser, invitedUsers, now);

        Map<UUID, UserAccount> usersById = new LinkedHashMap<>(findUsersById(
                invitedUsers.stream()
                        .map(UserAccount::getId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        ));
        usersById.put(currentUser.getId(), currentUser);

        return toResponse(
                conference,
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId),
                usersById,
                currentUser.getId(),
                null
        );
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

        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream()
                        .map(VideoConferenceParticipant::getUserId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        );
        usersById.putIfAbsent(currentUser.getId(), currentUser);
        return toResponse(conference, memberships, usersById, currentUser.getId(), findRecording(conferenceId));
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
            persistParticipants(conferenceId, null, invitedUsers, Instant.now());
            memberships = videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
            existingUsersById = findUsersById(
                    memberships.stream()
                            .map(VideoConferenceParticipant::getUserId)
                            .collect(Collectors.toCollection(LinkedHashSet::new))
            );
        }

        existingUsersById.putIfAbsent(currentUser.getId(), currentUser);
        return toResponse(conference, memberships, existingUsersById, currentUser.getId(), findRecording(conferenceId));
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
        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream()
                        .map(VideoConferenceParticipant::getUserId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        );
        usersById.putIfAbsent(currentUser.getId(), currentUser);
        return toResponse(conference, memberships, usersById, currentUser.getId(), findRecording(conferenceId));
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
        if (previousStoredFilename != null && !previousStoredFilename.equals(storedFile.storedFilename())) {
            conferenceRecordingStorage.deleteQuietly(previousStoredFilename);
        }

        List<VideoConferenceParticipant> memberships =
                videoConferenceParticipantRepository.findAllByConferenceIdOrderByInvitedAtAsc(conferenceId);
        Map<UUID, UserAccount> usersById = findUsersById(
                memberships.stream()
                        .map(VideoConferenceParticipant::getUserId)
                        .collect(Collectors.toCollection(LinkedHashSet::new))
        );
        usersById.putIfAbsent(currentUser.getId(), currentUser);
        return toResponse(conference, memberships, usersById, currentUser.getId(), recording);
    }

    public ConferenceRecordingDownload downloadRecording(String username, UUID conferenceId) {
        synchronizeImportedRecordings();
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        VideoConference conference = videoConferenceRepository.findById(conferenceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference not found"));
        if (!videoConferenceParticipantRepository.existsByConferenceIdAndUserId(conferenceId, currentUser.getId())) {
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
        Instant now = Instant.now();
        activateDueConferences(now);
        startDueConferences(now);
    }

    @Scheduled(fixedDelay = 15_000L)
    @Transactional
    public void importFinishedConferenceRecordings() {
        synchronizeImportedRecordings();
    }

    private VideoConferenceResponse toResponse(
            VideoConference conference,
            List<VideoConferenceParticipant> memberships,
            Map<UUID, UserAccount> usersById,
            UUID currentUserId,
            ConferenceRecording recording
    ) {
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(usersById.keySet());
        List<ParticipantResponse> participants = memberships.stream()
                .map(membership -> usersById.get(membership.getUserId()))
                .filter(Objects::nonNull)
                .map(user -> authService.toParticipant(user, onlineByUserId.getOrDefault(user.getId(), false)))
                .toList();

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
                participants
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

    private void persistParticipants(
            UUID conferenceId,
            UserAccount currentUser,
            List<UserAccount> invitedUsers,
            Instant invitedAt
    ) {
        if (currentUser != null) {
            videoConferenceParticipantRepository.save(
                    new VideoConferenceParticipant(UUID.randomUUID(), conferenceId, currentUser.getId(), invitedAt)
            );
        }
        invitedUsers.forEach(invitedUser -> videoConferenceParticipantRepository.save(
                new VideoConferenceParticipant(UUID.randomUUID(), conferenceId, invitedUser.getId(), invitedAt)
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

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
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
                conferenceRecordingImportService.deleteImportedRecordingQuietly(importedRecording.sourceDirectory());
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
            conferenceRecordingImportService.deleteImportedRecordingQuietly(importedRecording.sourceDirectory());
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

    public record ConferenceRecordingDownload(
            VideoConference conference,
            ConferenceRecording recording,
            Resource resource,
            String downloadFileName
    ) {
    }
}
