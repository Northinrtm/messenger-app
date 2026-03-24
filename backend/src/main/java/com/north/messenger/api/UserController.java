package com.north.messenger.api;

import com.north.messenger.api.dto.ContactRequest;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.application.auth.AuthService;
import jakarta.validation.Valid;
import java.util.List;
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

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AuthService authService;

    public UserController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/search")
    public List<UserProfileResponse> search(Authentication authentication, @RequestParam String query) {
        return authService.searchUsers(authentication.getName(), query);
    }

    @GetMapping("/contacts")
    public List<UserProfileResponse> listContacts(Authentication authentication) {
        return authService.listContacts(authentication.getName());
    }

    @PostMapping("/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    public UserProfileResponse addContact(
            Authentication authentication,
            @Valid @RequestBody ContactRequest request
    ) {
        return authService.addContact(authentication.getName(), request.username());
    }

    @DeleteMapping("/contacts/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeContact(Authentication authentication, @PathVariable String username) {
        authService.removeContact(authentication.getName(), username);
    }
}
