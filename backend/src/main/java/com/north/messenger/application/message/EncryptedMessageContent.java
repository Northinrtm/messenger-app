package com.north.messenger.application.message;

record EncryptedMessageContent(
        byte[] ciphertext,
        byte[] iv,
        int keyVersion,
        String algorithm
) {
}
