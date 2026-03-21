package com.north.messenger.application.auth;

import com.north.messenger.api.dto.AuthResponse;
import com.north.messenger.api.dto.LoginRequest;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.api.dto.RegisterRequest;
import com.north.messenger.api.dto.UserProfileResponse;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.security.JwtService;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            UserAccountRepository userAccountRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ) {
        this.userAccountRepository = userAccountRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String username = normalizeUsername(request.username());
        if (userAccountRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }

        UserAccount user = new UserAccount(
                UUID.randomUUID(),
                username,
                request.displayName().trim(),
                passwordEncoder.encode(request.password()),
                Instant.now()
        );
        userAccountRepository.save(user);
        return new AuthResponse(jwtService.createAccessToken(user), toProfile(user));
    }

    public AuthResponse login(LoginRequest request) {
        UserAccount user = requireUser(request.username());
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        return new AuthResponse(jwtService.createAccessToken(user), toProfile(user));
    }

    public UserProfileResponse me(String username) {
        return toProfile(requireUser(username));
    }

    public UserAccount requireUser(String username) {
        String normalizedUsername = normalizeUsername(username);
        return userAccountRepository.findByUsernameIgnoreCase(normalizedUsername)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    public ParticipantResponse toParticipant(UserAccount user) {
        return new ParticipantResponse(user.getId(), user.getUsername(), user.getDisplayName());
    }

    private UserProfileResponse toProfile(UserAccount user) {
        return new UserProfileResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getCreatedAt());
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }
}

