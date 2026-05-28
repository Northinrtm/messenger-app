package com.north.messenger.application.auth;

import com.north.messenger.api.dto.UserMailboxResponse;
import com.north.messenger.application.mail.MailProperties;
import com.north.messenger.domain.model.UserAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class UserMailboxService {

    private final AuthService authService;
    private final Optional<MailProperties> mailProperties;

    public UserMailboxService(AuthService authService, Optional<MailProperties> mailProperties) {
        this.authService = authService;
        this.mailProperties = mailProperties;
    }

    public List<UserMailboxResponse> listOwnMailboxes(String username) {
        if (mailProperties.isEmpty() || !mailProperties.get().enabled()) {
            return List.of();
        }
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        String email = currentUser.getUsername() + "@" + mailProperties.get().domain();
        return List.of(new UserMailboxResponse(currentUser.getId(), email, currentUser.getCreatedAt()));
    }
}
