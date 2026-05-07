package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatMessageKey;
import com.north.messenger.domain.repository.ChatMessageKeyRepository;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKey;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class ChatMessageContentKeyService {

    private final ChatMessageKeyRepository chatMessageKeyRepository;
    private final MessageContentEncryptionProperties properties;
    private final Map<MessageKeyCacheId, CachedResolvedKey> resolvedKeys = new ConcurrentHashMap<>();
    private final MessageContentEncryptionProvider activeProvider;

    ChatMessageContentKeyService(
            ChatMessageKeyRepository chatMessageKeyRepository,
            MessageContentEncryptionProperties properties,
            LocalMessageContentEncryptionProvider localProvider,
            AwsKmsMessageContentEncryptionProvider awsKmsProvider
    ) {
        this.chatMessageKeyRepository = chatMessageKeyRepository;
        this.properties = properties;
        this.activeProvider = switch (properties.provider()) {
            case LOCAL -> localProvider;
            case AWS_KMS -> awsKmsProvider;
        };
    }

    @Transactional
    ResolvedMessageKey getOrCreateActiveKey(UUID chatId) {
        return chatMessageKeyRepository.findFirstByChatIdOrderByKeyVersionDesc(chatId)
                .map(this::resolveKey)
                .orElseGet(() -> createInitialKey(chatId));
    }

    ResolvedMessageKey resolveKey(UUID chatId, int keyVersion) {
        return chatMessageKeyRepository.findByChatIdAndKeyVersion(chatId, keyVersion)
                .map(this::resolveKey)
                .orElseThrow(() -> new IllegalStateException(
                        "Message content key was not found for chatId=%s keyVersion=%s".formatted(chatId, keyVersion)
                ));
    }

    private ResolvedMessageKey createInitialKey(UUID chatId) {
        MessageContentEncryptionProvider.GeneratedDataKey generatedDataKey = activeProvider.generateDataKey();
        ChatMessageKey key = new ChatMessageKey(
                UUID.randomUUID(),
                chatId,
                1,
                generatedDataKey.encryptedDataKey(),
                activeProvider.providerName(),
                generatedDataKey.keyReference(),
                Instant.now()
        );
        try {
            chatMessageKeyRepository.saveAndFlush(key);
            ResolvedMessageKey resolvedKey = new ResolvedMessageKey(
                    chatId,
                    key.getKeyVersion(),
                    generatedDataKey.plaintextKey()
            );
            cache(resolvedKey);
            return resolvedKey;
        } catch (DataIntegrityViolationException exception) {
            return chatMessageKeyRepository.findFirstByChatIdOrderByKeyVersionDesc(chatId)
                    .map(this::resolveKey)
                    .orElseThrow(() -> new IllegalStateException(
                            "Message content key creation raced but no active key was found for chatId=" + chatId,
                            exception
                    ));
        }
    }

    private ResolvedMessageKey resolveKey(ChatMessageKey key) {
        MessageKeyCacheId cacheId = new MessageKeyCacheId(key.getChatId(), key.getKeyVersion());
        CachedResolvedKey cached = resolvedKeys.get(cacheId);
        if (cached != null && !cached.isExpired()) {
            return cached.resolvedKey();
        }
        if (!activeProvider.providerName().equals(key.getKeyProvider())) {
            throw new IllegalStateException(
                    "Configured message content provider %s cannot read stored key provider %s"
                            .formatted(activeProvider.providerName(), key.getKeyProvider())
            );
        }
        SecretKey plaintextKey = activeProvider.unwrapDataKey(key.getEncryptedDek(), key.getKeyReference());
        ResolvedMessageKey resolvedKey = new ResolvedMessageKey(key.getChatId(), key.getKeyVersion(), plaintextKey);
        cache(resolvedKey);
        return resolvedKey;
    }

    private void cache(ResolvedMessageKey resolvedKey) {
        Instant expiresAt = Instant.now().plus(properties.dekCacheTtl());
        resolvedKeys.put(
                new MessageKeyCacheId(resolvedKey.chatId(), resolvedKey.keyVersion()),
                new CachedResolvedKey(resolvedKey, expiresAt)
        );
    }

    private record MessageKeyCacheId(
            UUID chatId,
            int keyVersion
    ) {
    }

    private record CachedResolvedKey(
            ResolvedMessageKey resolvedKey,
            Instant expiresAt
    ) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }

    record ResolvedMessageKey(
            UUID chatId,
            int keyVersion,
            SecretKey secretKey
    ) {
    }
}
