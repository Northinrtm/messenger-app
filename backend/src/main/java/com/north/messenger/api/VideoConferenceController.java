package com.north.messenger.api;

import com.north.messenger.api.dto.AddConferenceParticipantsRequest;
import com.north.messenger.api.dto.CreateVideoConferenceRequest;
import com.north.messenger.api.dto.UpdateVideoConferenceRequest;
import com.north.messenger.api.dto.VideoConferenceResponse;
import com.north.messenger.application.chat.VideoConferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Conferences", description = "Conference scheduling, presence, participant management, and recording endpoints")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class VideoConferenceController {

    private final VideoConferenceService videoConferenceService;
    private final JwtService jwtService;

    public VideoConferenceController(VideoConferenceService videoConferenceService, JwtService jwtService) {
        this.videoConferenceService = videoConferenceService;
        this.jwtService = jwtService;
    }

    @GetMapping
    @Operation(summary = "List active conferences", description = "Returns non-archived conferences visible to the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Active conferences returned successfully", useReturnTypeSchema = true)
    })
    public List<VideoConferenceResponse> listConferences(Authentication authentication) {
        return videoConferenceService.listConferences(authentication.getName());
    }

    @GetMapping("/archive")
    @Operation(summary = "List archived conferences", description = "Returns ended/archived conferences visible to the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Archived conferences returned successfully", useReturnTypeSchema = true)
    })
    public List<VideoConferenceResponse> listArchivedConferences(Authentication authentication) {
        return videoConferenceService.listArchivedConferences(authentication.getName());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a conference", description = "Creates a scheduled or immediate conference. When chatId is provided, membership is derived from that group chat.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Conference created successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public VideoConferenceResponse createConference(
            Authentication authentication,
            @Valid @RequestBody CreateVideoConferenceRequest request
    ) {
        return videoConferenceService.createConference(authentication.getName(), request);
    }

    @PutMapping("/{conferenceId}")
    @Operation(summary = "Update a conference", description = "Updates conference metadata before the conference has started.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Conference updated successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse updateConference(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @Valid @RequestBody UpdateVideoConferenceRequest request
    ) {
        return videoConferenceService.updateConference(authentication.getName(), conferenceId, request);
    }

    @PostMapping("/{conferenceId}/start")
    @Operation(summary = "Start a conference", description = "Starts the conference room and returns the updated live conference state.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Conference started successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse startConference(Authentication authentication, @PathVariable UUID conferenceId) {
        return videoConferenceService.startConference(authentication.getName(), conferenceId);
    }

    @PostMapping("/{conferenceId}/participants")
    @Operation(summary = "Add conference participants", description = "Adds one or more participants to a conference that is still accepting invites.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Conference participants added successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse addParticipants(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @Valid @RequestBody AddConferenceParticipantsRequest request
    ) {
        return videoConferenceService.addParticipants(authentication.getName(), conferenceId, request);
    }

    @PostMapping("/{conferenceId}/presence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Mark conference presence", description = "Refreshes the authenticated participant's live presence heartbeat for the selected conference.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Conference presence refreshed successfully"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
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
    @Operation(summary = "Clear conference presence", description = "Marks the authenticated participant as no longer actively present in the selected conference.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Conference presence cleared successfully"),
            @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
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
    @Operation(summary = "Upload conference recording", description = "Uploads the finalized conference recording file after the conference has ended.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Conference recording uploaded successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse uploadRecording(
            Authentication authentication,
            @PathVariable UUID conferenceId,
            @Parameter(description = "Multipart video recording file to attach to the conference")
            @RequestParam("file") MultipartFile file
    ) {
        return videoConferenceService.uploadRecording(authentication.getName(), conferenceId, file);
    }

    @GetMapping("/{conferenceId}/recording")
    @Operation(summary = "Download conference recording", description = "Downloads the previously uploaded conference recording as a binary attachment.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Conference recording binary downloaded successfully",
                    content = @Content(
                            mediaType = "application/octet-stream",
                            schema = @Schema(type = "string", format = "binary")
                    )
            ),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
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
    @Operation(summary = "End a conference", description = "Ends an active conference for everyone and returns the archived conference state.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Conference ended successfully", useReturnTypeSchema = true),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
    public VideoConferenceResponse endConference(Authentication authentication, @PathVariable UUID conferenceId) {
        return videoConferenceService.endConference(authentication.getName(), conferenceId);
    }

    @DeleteMapping("/{conferenceId}/schedule")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Cancel a scheduled conference", description = "Cancels a conference before it has started.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Conference schedule cancelled successfully"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError"),
            @ApiResponse(responseCode = "409", ref = "#/components/responses/ConflictError")
    })
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
