package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ResolveEncryptionAccountKeysRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyRequest;
import com.north.messenger.api.dto.UserEncryptionIdentityResetRequest;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResolveResponse;
import com.north.messenger.api.dto.UserEncryptionAccountKeyResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserEncryptionAccountKey;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class UserEncryptionAccountKeyService {

    private final AuthService authService;
    private final UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private final IdentitySignedAccountKeyService identitySignedAccountKeyService;
    private final ApplicationEventPublisher eventPublisher;

    public UserEncryptionAccountKeyService(
            AuthService authService,
            UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository,
            IdentitySignedAccountKeyService identitySignedAccountKeyService,
            ApplicationEventPublisher eventPublisher
    ) {
        this.authService = authService;
        this.userEncryptionAccountKeyRepository = userEncryptionAccountKeyRepository;
        this.identitySignedAccountKeyService = identitySignedAccountKeyService;
        this.eventPublisher = eventPublisher;
    }

    public List<UserEncryptionAccountKeyResolveResponse> resolveAccountPublicKeys(
            String username,
            String accessToken,
            ResolveEncryptionAccountKeysRequest request
    ) {
        authService.requireAuthenticatedSession(username, accessToken);
        return userEncryptionAccountKeyRepository.findAllByUserIdIn(request.userIds()).stream()
                .map(accountKey -> new UserEncryptionAccountKeyResolveResponse(
                        accountKey.getUserId(),
                        accountKey.getPublicKey(),
                        accountKey.getAccountKeyVersion(),
                        accountKey.getIdentityGeneration(),
                        accountKey.getIdentitySigningPublicKey(),
                        accountKey.getIdentityKeyAlgorithm(),
                        accountKey.getAccountKeyAlgorithm(),
                        accountKey.getSignedAt().toString(),
                        accountKey.getAccountKeySignature()
                ))
                .collect(Collectors.toList());
    }

    public UserEncryptionAccountKeyResponse getOwnAccountKey(String username) {
        UUID userId = authService.requireAuthenticatedUser(username).getId();
        return userEncryptionAccountKeyRepository.findByUserId(userId)
                .map(this::toResponse)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "Encryption account key was not found"
                ));
    }

    @Transactional
    public UserEncryptionAccountKeyResponse upsertOwnAccountKey(
            String username,
            String accessToken,
            UserEncryptionAccountKeyRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession =
                authService.requireAuthenticatedSession(username, accessToken);
        UUID userId = authenticatedSession.user().getId();
        Instant now = Instant.now();

        UserEncryptionAccountKey existingAccountKey = userEncryptionAccountKeyRepository.findByUserId(userId)
                .orElse(null);
        validateSignedAccountKeyRequest(userId, existingAccountKey, request);
        boolean accountPublicKeyChanged = existingAccountKey == null
                || !request.publicKey().equals(existingAccountKey.getPublicKey());
        Instant signedAt = identitySignedAccountKeyService.parseSignedAt(request.signedAt());

        UserEncryptionAccountKey accountKey = java.util.Optional.ofNullable(existingAccountKey)
                .map(existing -> {
                    existing.update(
                            request.publicKey(),
                            request.accountKeyVersion(),
                            request.identityGeneration(),
                            request.identitySigningPublicKey(),
                            request.identityKeyAlgorithm(),
                            request.accountKeyAlgorithm(),
                            signedAt,
                            request.signature(),
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> new UserEncryptionAccountKey(
                        UUID.randomUUID(),
                        userId,
                        request.publicKey(),
                        request.identityGeneration(),
                        request.identitySigningPublicKey(),
                        request.identityKeyAlgorithm(),
                        request.accountKeyAlgorithm(),
                        signedAt,
                        request.signature(),
                        now,
                        now
                ));

        UserEncryptionAccountKey savedAccountKey = userEncryptionAccountKeyRepository.save(accountKey);
        if (accountPublicKeyChanged) {
            eventPublisher.publishEvent(new UserAccountKeyChangedEvent(userId));
        }
        return toResponse(savedAccountKey);
    }

    @Transactional
    public UserEncryptionAccountKeyResponse resetOwnIdentityKeyBundle(
            String username,
            String accessToken,
            UserEncryptionIdentityResetRequest request
    ) {
        AuthService.AuthenticatedSession authenticatedSession =
                authService.requireAuthenticatedSession(username, accessToken);
        UUID userId = authenticatedSession.user().getId();
        Instant now = Instant.now();
        UserEncryptionAccountKey existingAccountKey = userEncryptionAccountKeyRepository.findByUserId(userId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT,
                        "Encryption identity cannot be reset before the first account key bootstrap"
                ));
        authService.assertCurrentPassword(authenticatedSession.user(), request.currentPassword());
        validateIdentityResetRequest(userId, existingAccountKey, request);
        Instant signedAt = identitySignedAccountKeyService.parseSignedAt(request.signedAt());

        existingAccountKey.update(
                request.publicKey(),
                request.accountKeyVersion(),
                request.identityGeneration(),
                request.identitySigningPublicKey(),
                request.identityKeyAlgorithm(),
                request.accountKeyAlgorithm(),
                signedAt,
                request.signature(),
                now
        );
        UserEncryptionAccountKey savedAccountKey = userEncryptionAccountKeyRepository.save(existingAccountKey);
        eventPublisher.publishEvent(new UserIdentityResetEvent(userId));
        eventPublisher.publishEvent(new UserAccountKeyChangedEvent(userId));
        return toResponse(savedAccountKey);
    }

    private void validateSignedAccountKeyRequest(
            UUID userId,
            UserEncryptionAccountKey existingAccountKey,
            UserEncryptionAccountKeyRequest request
    ) {
        identitySignedAccountKeyService.verifySignedAccountKeyBundle(
                userId,
                request.publicKey(),
                request.accountKeyVersion(),
                request.identityGeneration(),
                request.identitySigningPublicKey(),
                request.identityKeyAlgorithm(),
                request.accountKeyAlgorithm(),
                request.signedAt(),
                request.signature()
        );

        if (existingAccountKey == null) {
            if (request.accountKeyVersion() != 1L || request.identityGeneration() != 1L) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Initial account key version and identity generation must both be 1"
                );
            }
            return;
        }

        if (existingAccountKey.getIdentityGeneration() != request.identityGeneration()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Identity generation cannot be changed by account key rotation"
            );
        }
        if (!existingAccountKey.getIdentitySigningPublicKey().equals(request.identitySigningPublicKey())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Identity signing key cannot be changed by account key rotation"
            );
        }
        if (!existingAccountKey.getIdentityKeyAlgorithm().equals(request.identityKeyAlgorithm())
                || !existingAccountKey.getAccountKeyAlgorithm().equals(request.accountKeyAlgorithm())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Key algorithms cannot be changed by account key rotation"
            );
        }

        if (existingAccountKey.getPublicKey().equals(request.publicKey())) {
            if (request.accountKeyVersion() != existingAccountKey.getAccountKeyVersion()) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT,
                        "Account key version does not match the currently published key"
                );
            }
            return;
        }

        if (request.accountKeyVersion() != existingAccountKey.getAccountKeyVersion() + 1L) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                "Account key version must increase by exactly one during rotation"
            );
        }
    }

    private void validateIdentityResetRequest(
            UUID userId,
            UserEncryptionAccountKey existingAccountKey,
            UserEncryptionIdentityResetRequest request
    ) {
        identitySignedAccountKeyService.verifySignedAccountKeyBundle(
                userId,
                request.publicKey(),
                request.accountKeyVersion(),
                request.identityGeneration(),
                request.identitySigningPublicKey(),
                request.identityKeyAlgorithm(),
                request.accountKeyAlgorithm(),
                request.signedAt(),
                request.signature()
        );
        if (request.accountKeyVersion() != 1L) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Identity reset must publish a fresh account key at version 1"
            );
        }
        if (request.identityGeneration() != existingAccountKey.getIdentityGeneration() + 1L) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Identity reset must increase identity generation by exactly one"
            );
        }
        if (existingAccountKey.getIdentitySigningPublicKey().equals(request.identitySigningPublicKey())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Identity reset must publish a new identity signing key"
            );
        }
        if (!IdentitySignedAccountKeyService.IDENTITY_KEY_ALGORITHM.equals(request.identityKeyAlgorithm())
                || !IdentitySignedAccountKeyService.ACCOUNT_KEY_ALGORITHM.equals(request.accountKeyAlgorithm())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Identity reset must use the current account key algorithms"
            );
        }
    }

    private UserEncryptionAccountKeyResponse toResponse(UserEncryptionAccountKey savedAccountKey) {
        return new UserEncryptionAccountKeyResponse(
                savedAccountKey.getPublicKey(),
                savedAccountKey.getAccountKeyVersion(),
                savedAccountKey.getIdentityGeneration(),
                savedAccountKey.getIdentitySigningPublicKey(),
                savedAccountKey.getIdentityKeyAlgorithm(),
                savedAccountKey.getAccountKeyAlgorithm(),
                savedAccountKey.getSignedAt().toString(),
                savedAccountKey.getAccountKeySignature(),
                savedAccountKey.getCreatedAt(),
                savedAccountKey.getUpdatedAt()
        );
    }
}
