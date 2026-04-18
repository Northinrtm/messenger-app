package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.UserEncryptionEnvelopeCounter;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserEncryptionEnvelopeCounterRepository extends JpaRepository<UserEncryptionEnvelopeCounter, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserEncryptionEnvelopeCounter> findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(
            UUID senderDeviceId,
            UUID recipientDeviceId,
            String ratchetPublicKey
    );

    @Modifying(flushAutomatically = true)
    @Query(value = """
            insert into user_encryption_envelope_counters (
                id,
                sender_device_id,
                recipient_device_id,
                ratchet_public_key,
                initiator_ephemeral_public_key,
                last_message_counter,
                updated_at
            )
            values (
                :id,
                :senderDeviceId,
                :recipientDeviceId,
                :ratchetPublicKey,
                :initiatorEphemeralPublicKey,
                :lastMessageCounter,
                :updatedAt
            )
            on conflict (sender_device_id, recipient_device_id, ratchet_public_key) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("id") UUID id,
            @Param("senderDeviceId") UUID senderDeviceId,
            @Param("recipientDeviceId") UUID recipientDeviceId,
            @Param("ratchetPublicKey") String ratchetPublicKey,
            @Param("initiatorEphemeralPublicKey") String initiatorEphemeralPublicKey,
            @Param("lastMessageCounter") int lastMessageCounter,
            @Param("updatedAt") Instant updatedAt
    );

    void deleteAllBySenderDeviceIdInOrRecipientDeviceIdIn(
            Collection<UUID> senderDeviceIds,
            Collection<UUID> recipientDeviceIds
    );
}
