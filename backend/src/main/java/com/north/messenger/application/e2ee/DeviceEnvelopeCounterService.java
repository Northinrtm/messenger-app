package com.north.messenger.application.e2ee;

import com.north.messenger.domain.model.UserEncryptionEnvelopeCounter;
import com.north.messenger.domain.repository.UserEncryptionEnvelopeCounterRepository;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeviceEnvelopeCounterService {

    private static final int MAX_DEVICE_COUNTER_ADVANCE = 4_096;

    private final UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository;

    public DeviceEnvelopeCounterService(
            UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository
    ) {
        this.userEncryptionEnvelopeCounterRepository = userEncryptionEnvelopeCounterRepository;
    }

    public void validateAndAdvanceCounters(
            UUID senderDeviceId,
            Map<UUID, EnvelopeCounterInput> envelopesByRecipientDeviceId
    ) {
        Instant now = Instant.now();
        for (Map.Entry<UUID, EnvelopeCounterInput> entry : envelopesByRecipientDeviceId.entrySet()) {
            UUID recipientDeviceId = entry.getKey();
            EnvelopeCounterInput envelope = entry.getValue();
            UserEncryptionEnvelopeCounter counter = userEncryptionEnvelopeCounterRepository
                    .findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(
                            senderDeviceId,
                            recipientDeviceId,
                            envelope.ratchetPublicKey()
                    )
                    .orElse(null);
            if (counter == null) {
                validateInitialEnvelopeCounter(envelope.messageCounter());
                if (userEncryptionEnvelopeCounterRepository.insertIfAbsent(
                        UUID.randomUUID(),
                        senderDeviceId,
                        recipientDeviceId,
                        envelope.ratchetPublicKey(),
                        envelope.initiatorEphemeralPublicKey(),
                        envelope.messageCounter(),
                        now
                ) == 1) {
                    continue;
                }
                counter = userEncryptionEnvelopeCounterRepository
                        .findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(
                                senderDeviceId,
                                recipientDeviceId,
                                envelope.ratchetPublicKey()
                        )
                        .orElseThrow(() -> new IllegalStateException(
                                "Encrypted device envelope counter was not persisted after concurrent insert"
                        ));
            }

            validateExistingEnvelopeCounter(counter, envelope);
            counter.bindInitiatorEphemeralPublicKeyIfMissing(envelope.initiatorEphemeralPublicKey());
            counter.advanceTo(envelope.messageCounter(), now);
            userEncryptionEnvelopeCounterRepository.save(counter);
        }
    }

    private void validateInitialEnvelopeCounter(int messageCounter) {
        if (messageCounter != 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope must start at counter zero"
            );
        }
    }

    private void validateExistingEnvelopeCounter(
            UserEncryptionEnvelopeCounter counter,
            EnvelopeCounterInput envelope
    ) {
        if (envelope.messageCounter() <= counter.getLastMessageCounter()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope message counter is stale"
            );
        }
        if (counter.getInitiatorEphemeralPublicKey() != null
                && !counter.getInitiatorEphemeralPublicKey().isBlank()
                && !counter.getInitiatorEphemeralPublicKey().equals(envelope.initiatorEphemeralPublicKey())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope chain metadata is invalid"
            );
        }
        if (envelope.messageCounter() - counter.getLastMessageCounter() > MAX_DEVICE_COUNTER_ADVANCE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Encrypted device envelope message counter advanced too far"
            );
        }
    }

    public record EnvelopeCounterInput(
            String ratchetPublicKey,
            String initiatorEphemeralPublicKey,
            int messageCounter
    ) {
    }
}
