package com.north.messenger.application.message;

public interface RealtimeMessagingGateway {

    void sendToTopic(String destination, Object payload);

    void sendToUser(String username, String destination, Object payload);
}
