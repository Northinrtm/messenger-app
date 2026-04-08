package com.north.messenger.api;

import com.north.messenger.api.dto.AddConferenceParticipantsRequest;
import com.north.messenger.api.dto.CreateVideoConferenceRequest;
import com.north.messenger.api.dto.UpdateVideoConferenceRequest;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.chat.VideoConferenceService;
import com.north.messenger.security.JwtService;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/conferences")
public class VideoConferenceController {

    private final VideoConferenceService videoConferenceService;
    private final JwtService jwtService;

    public VideoConferenceController(VideoConferenceService videoConferenceService, JwtService jwtService) {
        this.videoConferenceService = videoConferenceService;
        this.jwtService = jwtService;
    }

    @GetMapping
    public List<VideoConferenceResponse> listConferences(Authentication authentication) {
        return videoConferenceService.listConferences(authentication.getName());
    }

    @GetMapping("/archive")
    public List<VideoConferenceResponse> listArchivedConferences(Authentication authentication) {
        return videoConferenceService.listArchivedConferences(authentication.getName());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VideoConferenceResponse createConference(
            Authentication authentication,
            @Valid @RequestBody CreateVideoConferenceRequest request
    ) {
        return videoConferenceService.createConference(authentication.getName(), request);
    }

    @PutMapping("/{conferenceId}")
    public VideoConferenceResponse updateConference(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @Valid @RequestBody UpdateVideoConferenceRequest request
    ) {
        return videoConferenceService.updateConference(authentication.getName(), conferenceId, request);
    }

    @PostMapping("/{conferenceId}/start")
    public VideoConferenceResponse startConference(Authentication authentication, @PathVariable UUID conferenceId) {
        return videoConferenceService.startConference(authentication.getName(), conferenceId);
    }

    @PostMapping("/{conferenceId}/participants")
    public VideoConferenceResponse addParticipants(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @Valid @RequestBody AddConferenceParticipantsRequest request
    ) {
        return videoConferenceService.addParticipants(authentication.getName(), conferenceId, request);
    }

    @PostMapping("/{conferenceId}/presence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void touchConferencePresence(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorizationHeader
    ) {
        videoConferenceService.touchConferencePresence(
                authentication.getName(),
                extractSessionId(authorizationHeader),
                conferenceId
        );
    }

    @DeleteMapping("/{conferenceId}/presence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearConferencePresence(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorizationHeader
    ) {
        videoConferenceService.clearConferencePresence(
                authentication.getName(),
                extractSessionId(authorizationHeader),
                conferenceId
        );
    }

    @PostMapping(path = "/{conferenceId}/recording", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public VideoConferenceResponse uploadRecording(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @RequestParam("file") MultipartFile file
    ) {
        return videoConferenceService.uploadRecording(authentication.getName(), conferenceId, file);
    }

    @GetMapping("/{conferenceId}/recording")
    public ResponseEntity<Resource> downloadRecording(
            Authentication authentication,
            @PathVariable UUID conferenceId
    ) {
        VideoConferenceService.ConferenceRecordingDownload download =
                videoConferenceService.downloadRecording(authentication.getName(), conferenceId);
        MediaType mediaType = MediaType.parseMediaType(download.recording().getMimeType());
        ContentDisposition contentDisposition = ContentDisposition.attachment()
                .filename(download.downloadFileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(download.recording().getSizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .body(download.resource());
    }

    @DeleteMapping("/{conferenceId}")
    public VideoConferenceResponse endConference(Authentication authentication, @PathVariable UUID conferenceId) {
        return videoConferenceService.endConference(authentication.getName(), conferenceId);
    }

    @DeleteMapping("/{conferenceId}/schedule")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelConference(Authentication authentication, @PathVariable UUID conferenceId) {
        videoConferenceService.cancelConference(authentication.getName(), conferenceId);
    }

    private UUID extractSessionId(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authorization header is required");
        }

        try {
            return jwtService.extractSessionId(authorizationHeader.substring(7));
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid access token", exception);
        }
    }
}
