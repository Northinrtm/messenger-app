package com.north.messenger.application.message;

import javax.crypto.SecretKey;

interface MessageContentEncryptionProvider {

    String providerName();

    GeneratedDataKey generateDataKey();

    SecretKey unwrapDataKey(byte[] encryptedDataKey, String keyReference);

    record GeneratedDataKey(
            byte[] encryptedDataKey,
            SecretKey plaintextKey,
            String keyReference
    ) {
    }
}
