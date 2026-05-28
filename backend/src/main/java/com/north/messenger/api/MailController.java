package com.north.messenger.api;

import com.north.messenger.api.dto.MailMessageDetailResponse;
import com.north.messenger.api.dto.MailMessageSummaryResponse;
import com.north.messenger.api.dto.SendMailRequest;
import com.north.messenger.application.mail.MailMessageDetail;
import com.north.messenger.application.mail.MailMessageSummary;
import com.north.messenger.application.mail.UserMailService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/mail")
@Tag(name = "Mail", description = "User mailbox — inbox, sent, message read, send, and delete")
@SecurityRequirement(name = "bearerAuth")
public class MailController {

    private final Optional<UserMailService> mailService;

    public MailController(Optional<UserMailService> mailService) {
        this.mailService = mailService;
    }

    @GetMapping("/inbox")
    @Operation(summary = "List inbox messages")
    public List<MailMessageSummaryResponse> inbox(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        return requireMailService().listInbox(authentication.getName(), page, size)
                .stream()
                .map(this::toSummaryResponse)
                .toList();
    }

    @GetMapping("/sent")
    @Operation(summary = "List sent messages")
    public List<MailMessageSummaryResponse> sent(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        List<MailMessageSummary> result = requireMailService().listSent(authentication.getName(), page, size);
        if (result == null) {
            return List.of();
        }
        return result.stream().map(this::toSummaryResponse).toList();
    }

    @GetMapping("/message/{messageId}")
    @Operation(summary = "Get a message by ID")
    public MailMessageDetailResponse getMessage(
            Authentication authentication,
            @PathVariable String messageId
    ) {
        MailMessageDetail detail = requireMailService().getMessage(authentication.getName(), messageId);
        return toDetailResponse(detail);
    }

    @PostMapping("/send")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Send an email")
    public void send(
            Authentication authentication,
            @Valid @RequestBody SendMailRequest request
    ) {
        requireMailService().sendMessage(authentication.getName(), request.to(), request.subject(), request.body());
    }

    @DeleteMapping("/message/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a message")
    public void deleteMessage(
            Authentication authentication,
            @PathVariable String messageId
    ) {
        requireMailService().deleteMessage(authentication.getName(), messageId);
    }

    private UserMailService requireMailService() {
        return mailService.orElseThrow(
                () -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Mail feature is not enabled")
        );
    }

    private MailMessageSummaryResponse toSummaryResponse(MailMessageSummary m) {
        return new MailMessageSummaryResponse(m.id(), m.from(), m.subject(), m.sentAt(), m.read());
    }

    private MailMessageDetailResponse toDetailResponse(MailMessageDetail m) {
        return new MailMessageDetailResponse(m.id(), m.from(), m.to(), m.subject(), m.body(), m.sentAt(), m.read());
    }
}
